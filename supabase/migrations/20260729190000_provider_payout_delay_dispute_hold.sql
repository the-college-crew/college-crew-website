-- Provider payout delay + dispute hold.
--
-- Two problems this fixes:
--
-- 1. `private.queue_provider_payout()` enqueued the payout at
--    `statement_timestamp()`, so held platform funds left for the student's
--    connected account on the very next cron tick (~1 minute) after a booking
--    completed. Because the platform is the merchant of record (platform-held
--    charges, no `on_behalf_of`), any later refund or chargeback came out of the
--    platform balance after the student had already been paid.
--
-- 2. Neither dispute path touched the payout. `record_stripe_dispute` and
--    `open_booking_dispute` recorded the dispute and alerted the founder, but a
--    pending payout still fired on schedule.
--
-- The payout now waits 3 days after completion, and a dispute arriving in that
-- window freezes the job until an admin releases it.

set lock_timeout = '10s';
set statement_timeout = '2min';

-- ---------------------------------------------------------------------------
-- `blocked`: a job that must not run until an admin releases it.
--
-- No change to `claim_booking_automation_jobs` is needed — it already claims
-- only `status in ('pending', 'retry')`, so `blocked` rows are skipped. The
-- lease-shape constraint is satisfied because blocked rows keep null lease
-- columns.
-- ---------------------------------------------------------------------------

alter table public.booking_automation_jobs
  drop constraint if exists booking_automation_jobs_status_valid;
alter table public.booking_automation_jobs
  add constraint booking_automation_jobs_status_valid check (
    status in ('pending', 'processing', 'retry', 'succeeded', 'failed', 'blocked')
  );

-- ---------------------------------------------------------------------------
-- Delay the payout by 3 days.
--
-- `enqueue_booking_automation_job` writes `p_run_at` into both `run_at` and
-- `next_attempt_at`, and the claim query requires both `<= statement_timestamp()`,
-- so moving `run_at` alone reliably defers execution.
-- ---------------------------------------------------------------------------

create or replace function private.queue_provider_payout()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.booking_flow in ('hourly_v1', 'quote_v2')
    and (
      (new.status = 'completed' and old.status is distinct from 'completed')
      or (
        new.status = 'cancelled'
        and old.status is distinct from 'cancelled'
        and new.cancellation_policy_result = 'no_refund'
      )
    ) then
    perform private.enqueue_booking_automation_job(
      'provider_payout_' || new.id::text, 'provider_payout',
      new.id, new.id, statement_timestamp() + interval '3 days'
    );
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Freeze a pending payout when a dispute lands.
--
-- If the payout already succeeded the dispute lost the race and the money is
-- gone; that needs manual clawback, so it raises a founder alert rather than
-- failing quietly. That is the case we most need to hear about.
-- ---------------------------------------------------------------------------

create or replace function private.hold_provider_payout(
  p_booking_id uuid,
  p_reason text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.booking_automation_jobs%rowtype;
begin
  if p_booking_id is null then return 'no_booking'; end if;

  select j.* into v_job
  from public.booking_automation_jobs j
  where j.booking_id = p_booking_id and j.kind = 'provider_payout'
  for update;
  if not found then return 'no_job'; end if;

  if v_job.status = 'succeeded' then
    perform private.enqueue_founder_alert(
      'payout_after_dispute_' || p_booking_id::text,
      p_booking_id, 'payout_after_dispute_admin',
      jsonb_build_object('booking_id', p_booking_id, 'reason', p_reason)
    );
    return 'already_paid';
  end if;

  if v_job.status in ('pending', 'retry') then
    update public.booking_automation_jobs
    set status = 'blocked',
        last_error_class = left(coalesce(p_reason, 'dispute_hold'), 200),
        last_error_at = statement_timestamp(),
        updated_at = now()
    where id = v_job.id;
    return 'blocked';
  end if;

  -- 'processing' means the scheduler holds a lease right now. The TS-side
  -- pre-check in attemptProviderPayout is what stops that in-flight run; the
  -- job returns to 'pending' on lease expiry and is blocked on the next pass.
  -- 'failed'/'blocked' need no further action.
  return v_job.status;
end;
$$;

-- ---------------------------------------------------------------------------
-- Block a job the scheduler is currently holding a lease on.
--
-- The scheduler needs this because completing the job would mark it `succeeded`
-- and strand the payout forever, while throwing would burn the retry budget and
-- eventually send it terminal. Blocking under the lease is the only outcome that
-- both stops the transfer and keeps the payout recoverable.
-- ---------------------------------------------------------------------------

create or replace function public.block_booking_automation_job(
  p_job_id uuid,
  p_lease_token uuid,
  p_reason text
)
returns boolean
language sql
security definer
set search_path = ''
as $$
  update public.booking_automation_jobs
  set status = 'blocked', lease_token = null, lease_expires_at = null,
      last_error_class = left(coalesce(p_reason, 'blocked'), 200),
      last_error_at = statement_timestamp(), updated_at = now()
  where id = p_job_id and status = 'processing' and lease_token = p_lease_token
  returning true;
$$;

revoke all on function public.block_booking_automation_job(uuid, uuid, text)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Admin release: put a blocked payout back in line to run on the next tick.
-- ---------------------------------------------------------------------------

create or replace function public.release_provider_payout(p_booking_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_job public.booking_automation_jobs%rowtype;
begin
  if v_actor is null or not public.is_admin() then
    raise exception 'NOT_AUTHORIZED';
  end if;

  select j.* into v_job
  from public.booking_automation_jobs j
  where j.booking_id = p_booking_id and j.kind = 'provider_payout'
  for update;
  if not found then raise exception 'PAYOUT_JOB_NOT_FOUND'; end if;
  if v_job.status <> 'blocked' then
    raise exception 'PAYOUT_NOT_BLOCKED:%', v_job.status;
  end if;

  -- Reset the attempt budget: the block was a deliberate hold, not a failure,
  -- so a released payout gets a full set of retries.
  update public.booking_automation_jobs
  set status = 'pending',
      run_at = statement_timestamp(),
      next_attempt_at = statement_timestamp(),
      attempt_count = 0,
      last_error_class = null,
      last_error_at = null,
      updated_at = now()
  where id = v_job.id;

  insert into public.booking_audit_events (
    booking_id, actor_user_id, actor_kind, action, from_status, to_status, metadata
  )
  values (
    p_booking_id, v_actor, 'admin', 'provider_payout_released', null, null,
    jsonb_build_object('booking_id', p_booking_id)
  );

  return 'released';
end;
$$;

revoke all on function public.release_provider_payout(uuid) from public, anon;
grant execute on function public.release_provider_payout(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Hook both dispute entry points.
-- ---------------------------------------------------------------------------

-- Real card chargebacks. Body is unchanged apart from the hold call.
create or replace function public.record_stripe_dispute(p_event jsonb)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_obj jsonb := p_event -> 'data' -> 'object';
  v_dispute_id text := v_obj ->> 'id';
  v_charge_id text := v_obj ->> 'charge';
  v_pi_id text := v_obj ->> 'payment_intent';
  v_due bigint := nullif(v_obj #>> '{evidence_details,due_by}', '')::bigint;
  v_payment public.booking_payments%rowtype;
  v_booking_id uuid;
  v_payment_id uuid;
begin
  if coalesce(btrim(v_dispute_id), '') = '' then
    return 'missing_dispute_id';
  end if;

  if v_pi_id is not null then
    select bp.* into v_payment from public.booking_payments bp
    where bp.stripe_payment_intent_id = v_pi_id;
    if found then
      v_booking_id := v_payment.booking_id;
      v_payment_id := v_payment.id;
    end if;
  end if;

  insert into public.stripe_disputes (
    stripe_dispute_id, stripe_charge_id, stripe_payment_intent_id, booking_id,
    payment_id, amount_cents, currency, reason, status, evidence_due_by,
    is_charge_refundable, payload
  )
  values (
    v_dispute_id, v_charge_id, v_pi_id, v_booking_id, v_payment_id,
    nullif(v_obj ->> 'amount', '')::integer, v_obj ->> 'currency', v_obj ->> 'reason',
    v_obj ->> 'status',
    case when v_due is not null then to_timestamp(v_due) else null end,
    (v_obj ->> 'is_charge_refundable')::boolean, v_obj
  )
  on conflict (stripe_dispute_id) do update
  set status = excluded.status,
      reason = excluded.reason,
      evidence_due_by = excluded.evidence_due_by,
      is_charge_refundable = excluded.is_charge_refundable,
      booking_id = coalesce(public.stripe_disputes.booking_id, excluded.booking_id),
      payment_id = coalesce(public.stripe_disputes.payment_id, excluded.payment_id),
      payload = excluded.payload,
      updated_at = now();

  if v_booking_id is not null then
    insert into public.booking_audit_events (
      booking_id, actor_user_id, actor_kind, action, from_status, to_status, metadata
    )
    values (
      v_booking_id, null, 'stripe', 'external_card_dispute', null, null,
      jsonb_build_object('stripe_dispute_id', v_dispute_id, 'status', v_obj ->> 'status')
    );
    perform private.enqueue_founder_alert(
      'card_dispute_' || v_dispute_id || '_' || coalesce(v_obj ->> 'status', 'unknown'),
      v_booking_id, 'card_dispute_admin',
      jsonb_build_object('stripe_dispute_id', v_dispute_id, 'status', v_obj ->> 'status')
    );
    -- Freeze the payout while the chargeback is live. Unconditional on status:
    -- even a `lost` dispute must not pay the student, since the customer has
    -- already been made whole out of the platform balance.
    perform private.hold_provider_payout(
      v_booking_id, 'stripe_dispute:' || coalesce(v_obj ->> 'status', 'unknown')
    );
  end if;

  return 'recorded';
end;
$$;

-- In-app customer disputes. Body is unchanged apart from the hold call.
create or replace function public.open_booking_dispute(
  p_booking_id uuid,
  p_category public.booking_dispute_category,
  p_narrative text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_now timestamptz := statement_timestamp();
  v_booking public.bookings%rowtype;
  v_invoice public.booking_invoices%rowtype;
  v_narrative text := btrim(coalesce(p_narrative, ''));
  v_final_at timestamptz;
  v_due timestamptz;
  v_late boolean := false;
  v_id uuid;
begin
  if char_length(v_narrative) < 10 or char_length(v_narrative) > 5000 then
    raise exception 'INVALID_NARRATIVE';
  end if;
  select b.* into v_booking from public.bookings b
  where b.id = p_booking_id and b.customer_id = v_actor for update;
  if not found then raise exception 'BOOKING_NOT_FOUND'; end if;
  if v_booking.booking_flow not in ('hourly_v1', 'quote_v2') then
    raise exception 'UNSUPPORTED_BOOKING_FLOW';
  end if;
  if exists (select 1 from public.booking_disputes d
             where d.booking_id = p_booking_id) then
    raise exception 'DISPUTE_ALREADY_OPEN';
  end if;
  select bi.* into v_invoice from public.booking_invoices bi
  where bi.booking_id = p_booking_id;
  if v_booking.status = 'completed' then
    v_final_at := coalesce(
      v_invoice.resolved_at,
      (select bp.succeeded_at from public.booking_payments bp
       where bp.booking_id = p_booking_id and bp.kind = 'balance'
         and bp.status = 'succeeded')
    );
    if v_final_at is null or v_now > v_final_at + interval '7 days' then
      raise exception 'DISPUTE_WINDOW_CLOSED';
    end if;
    v_late := true;
    v_due := v_final_at + interval '7 days';
  elsif v_booking.status in ('booked','in_progress','invoice_review') then
    if p_category = 'provider_no_show'
      and (v_booking.arrived_at is not null or v_now < v_booking.scheduled_at) then
      raise exception 'NO_SHOW_NOT_APPLICABLE';
    end if;
    v_due := v_invoice.autocharge_at;
  else
    raise exception 'DISPUTE_NOT_ALLOWED:%', v_booking.status;
  end if;
  insert into public.booking_disputes (
    booking_id, customer_id, category, narrative, status, opened_at,
    dispute_due_at
  ) values (
    p_booking_id, v_actor, p_category, v_narrative, 'open', v_now, v_due
  ) returning id into v_id;
  if not v_late then
    perform set_config('college_crew.trusted_booking_operation', 'on', true);
    update public.bookings set status = 'disputed'
    where id = p_booking_id and status = v_booking.status;
    if v_invoice.id is not null then
      update public.booking_invoices set autocharge_at = null, updated_at = now()
      where id = v_invoice.id;
    end if;
  end if;
  -- A dispute opened after completion (`v_late`) is exactly the case the 3-day
  -- payout delay exists for: freeze the pending payout so the student is not
  -- paid while the job is contested.
  perform private.hold_provider_payout(p_booking_id, 'booking_dispute');
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Read model for the admin booking detail page: payout state for one booking.
-- ---------------------------------------------------------------------------

create or replace function public.admin_booking_payout_state(p_booking_id uuid)
returns table (
  job_status text,
  run_at timestamptz,
  hold_reason text,
  paid_cents integer
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not public.is_admin() then
    raise exception 'NOT_AUTHORIZED';
  end if;

  return query
  select j.status, j.run_at, j.last_error_class,
    (select coalesce(sum(p.amount_cents), 0)::integer
     from public.booking_provider_payouts p
     where p.booking_id = p_booking_id and p.status = 'paid')
  from public.booking_automation_jobs j
  where j.booking_id = p_booking_id and j.kind = 'provider_payout';
end;
$$;

revoke all on function public.admin_booking_payout_state(uuid) from public, anon;
grant execute on function public.admin_booking_payout_state(uuid) to authenticated;
