-- Hourly Booking v1 — Phase 6: cancellations, refunds, disputes, and admin.
--
-- Builds the exception model on the Phase 1 substrate (booking_refunds,
-- booking_disputes, booking_audit_events, email_outbox, and the lifecycle
-- transitions already permitted by enforce_booking_transition):
--   * requested/accepted/booked -> cancelled  (customer / provider)
--   * booked/in_progress/invoice_review -> disputed
--   * disputed -> completed / cancelled
-- No new booking states or cancellation columns are introduced. This migration
-- adds one server-only table for external card-network disputes, a shared
-- e-mail-outbox helper (Phase 7 delivers), and the trusted domain RPCs the
-- cancellation UI, the customer dispute intake, the founder resolution tools,
-- and the Stripe webhook call.
--
-- Money never moves from SQL: each RPC records the durable intent (a
-- booking_refunds row or a balance payment row) and returns a directive; the
-- server action performs the Stripe charge/refund with the admin client and a
-- service-role settle/reconcile RPC records the result. This keeps every
-- financial mutation idempotent, state-guarded, and reconcilable from webhooks.

-- ---------------------------------------------------------------------------
-- private.enqueue_booking_email — idempotent outbox insert (Phase 7 delivers)
-- ---------------------------------------------------------------------------

create function private.enqueue_booking_email(
  p_event_key text,
  p_booking_id uuid,
  p_recipient_user_id uuid,
  p_recipient_email text,
  p_template text,
  p_payload jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_recipient_email is null or btrim(p_recipient_email) = '' then
    return;
  end if;
  insert into public.email_outbox (
    event_key, booking_id, recipient_user_id, recipient_email, template, payload
  )
  values (
    p_event_key, p_booking_id, p_recipient_user_id, p_recipient_email, p_template,
    coalesce(p_payload, '{}'::jsonb)
  )
  on conflict (event_key) do nothing;
end;
$$;

revoke execute on function private.enqueue_booking_email(text, uuid, uuid, text, text, jsonb)
  from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- private.enqueue_founder_alert — fan a booking alert out to every admin
-- ---------------------------------------------------------------------------

create function private.enqueue_founder_alert(
  p_event_prefix text,
  p_booking_id uuid,
  p_template text,
  p_payload jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin record;
begin
  for v_admin in
    select p.id as user_id, u.email as email
    from public.profiles p
    join auth.users u on u.id = p.id
    where p.role = 'admin' and u.email is not null
  loop
    perform private.enqueue_booking_email(
      p_event_prefix || '_' || v_admin.user_id::text,
      p_booking_id,
      v_admin.user_id,
      v_admin.email,
      p_template,
      p_payload
    );
  end loop;
end;
$$;

revoke execute on function private.enqueue_founder_alert(text, uuid, text, jsonb)
  from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- private.create_first_hour_refund_request — durable "refund owed" record
-- ---------------------------------------------------------------------------
-- Inserts a booking_refunds row for the captured first-hour payment with a
-- caller-supplied deterministic key. Idempotent; returns true when it created
-- the row (or one already exists to execute), false when there is nothing to
-- refund. The action executes the Stripe refund and settles the row.

create function private.create_first_hour_refund_request(
  p_booking_id uuid,
  p_idempotency_key text,
  p_reason text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment public.booking_payments%rowtype;
begin
  select bp.* into v_payment
  from public.booking_payments bp
  where bp.booking_id = p_booking_id
    and bp.kind = 'first_hour'
    and bp.status = 'succeeded';
  if not found then
    return false;
  end if;

  insert into public.booking_refunds (
    booking_id, payment_id, amount_cents, reason, status, idempotency_key,
    reverse_transfer, refund_application_fee
  )
  values (
    p_booking_id, v_payment.id, v_payment.amount_cents,
    coalesce(nullif(btrim(p_reason), ''), 'cancellation_full_refund'),
    'created', p_idempotency_key, true, true
  )
  on conflict (idempotency_key) do nothing;

  return true;
end;
$$;

revoke execute on function private.create_first_hour_refund_request(uuid, text, text)
  from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- cancel_booking_as_customer — actor-specific hourly cancellation (customer)
-- ---------------------------------------------------------------------------
-- Re-derives the locked cancellation matrix atomically under a row lock. Valid
-- before Arrived from requested/accepted/booked. Rejects an arrived booking and
-- a passed-start no-show (both route to the dispute surface). Returns the
-- policy result; 'full_refund' tells the action to execute the first-hour
-- refund it recorded here.

create function public.cancel_booking_as_customer(p_booking_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_now timestamptz := statement_timestamp();
  v_booking public.bookings%rowtype;
  v_has_first_hour boolean;
  v_result text;
begin
  if v_actor is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  select b.* into v_booking
  from public.bookings b
  where b.id = p_booking_id and b.customer_id = v_actor
  for update of b;
  if not found then
    raise exception 'BOOKING_NOT_FOUND';
  end if;
  if v_booking.booking_flow <> 'hourly_v1' then
    raise exception 'NOT_HOURLY_BOOKING';
  end if;
  if v_booking.arrived_at is not null then
    raise exception 'BOOKING_ALREADY_ARRIVED';
  end if;
  if v_booking.status not in ('requested', 'accepted', 'booked') then
    raise exception 'BOOKING_NO_LONGER_CANCELLABLE:%', v_booking.status;
  end if;

  select exists (
    select 1 from public.booking_payments bp
    where bp.booking_id = v_booking.id
      and bp.kind = 'first_hour'
      and bp.status = 'succeeded'
  ) into v_has_first_hour;

  -- Paid booking whose start has passed with no arrival: no-show dispute path.
  if v_booking.status = 'booked' and v_now >= v_booking.scheduled_at then
    raise exception 'USE_NO_SHOW_DISPUTE';
  end if;

  if not v_has_first_hour then
    v_result := 'no_payment';
  elsif (v_booking.scheduled_at - v_now)
        >= make_interval(hours => 12) then
    v_result := 'full_refund';
  else
    v_result := 'no_refund';
  end if;

  perform set_config('college_crew.trusted_booking_operation', 'on', true);
  update public.bookings
  set
    status = 'cancelled',
    cancelled_at = v_now,
    cancelled_by = v_actor,
    cancelled_by_role = 'customer',
    cancellation_reason = 'customer_cancelled',
    cancellation_policy_result = v_result
  where id = p_booking_id and status = v_booking.status;
  if not found then
    raise exception 'BOOKING_NO_LONGER_CANCELLABLE';
  end if;

  if v_result = 'full_refund' then
    perform private.create_first_hour_refund_request(
      v_booking.id, 'refund_cxl_' || v_booking.id::text, 'customer_cancellation_full_refund'
    );
  end if;

  insert into public.booking_audit_events (
    booking_id, actor_user_id, actor_kind, action, from_status, to_status, metadata
  )
  values (
    v_booking.id, v_actor, 'customer', 'customer_cancelled', v_booking.status, 'cancelled',
    jsonb_build_object('policy_result', v_result, 'had_first_hour', v_has_first_hour)
  );

  perform private.enqueue_founder_alert(
    'cancel_customer_' || v_booking.id::text, v_booking.id, 'booking_cancelled_admin',
    jsonb_build_object('actor', 'customer', 'policy_result', v_result)
  );

  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- cancel_booking_as_provider — actor-specific hourly cancellation (provider)
-- ---------------------------------------------------------------------------
-- Requires a reason. Always fully refunds a captured first hour before Arrived.
-- Rejects an arrived booking (dispute path). Valid from accepted/booked.

create function public.cancel_booking_as_provider(
  p_booking_id uuid,
  p_reason text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_now timestamptz := statement_timestamp();
  v_booking public.bookings%rowtype;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_has_first_hour boolean;
  v_result text;
begin
  if v_actor is null then
    raise exception 'AUTH_REQUIRED';
  end if;
  if char_length(v_reason) < 3 or char_length(v_reason) > 500 then
    raise exception 'CANCELLATION_REASON_REQUIRED';
  end if;

  select b.* into v_booking
  from public.bookings b
  where b.id = p_booking_id
  for update of b;
  if not found then
    raise exception 'BOOKING_NOT_FOUND';
  end if;
  if not public.owns_provider_profile(v_booking.provider_id) then
    raise exception 'NOT_AUTHORIZED';
  end if;
  if v_booking.booking_flow <> 'hourly_v1' then
    raise exception 'NOT_HOURLY_BOOKING';
  end if;
  if v_booking.arrived_at is not null then
    raise exception 'BOOKING_ALREADY_ARRIVED';
  end if;
  if v_booking.status not in ('accepted', 'booked') then
    raise exception 'BOOKING_NO_LONGER_CANCELLABLE:%', v_booking.status;
  end if;

  select exists (
    select 1 from public.booking_payments bp
    where bp.booking_id = v_booking.id
      and bp.kind = 'first_hour'
      and bp.status = 'succeeded'
  ) into v_has_first_hour;

  v_result := case when v_has_first_hour then 'full_refund' else 'no_payment' end;

  perform set_config('college_crew.trusted_booking_operation', 'on', true);
  update public.bookings
  set
    status = 'cancelled',
    cancelled_at = v_now,
    cancelled_by = v_actor,
    cancelled_by_role = 'provider',
    cancellation_reason = v_reason,
    cancellation_policy_result = v_result
  where id = p_booking_id and status = v_booking.status;
  if not found then
    raise exception 'BOOKING_NO_LONGER_CANCELLABLE';
  end if;

  if v_result = 'full_refund' then
    perform private.create_first_hour_refund_request(
      v_booking.id, 'refund_cxl_' || v_booking.id::text, 'provider_cancellation_full_refund'
    );
  end if;

  insert into public.booking_audit_events (
    booking_id, actor_user_id, actor_kind, action, from_status, to_status, metadata
  )
  values (
    v_booking.id, v_actor, 'provider', 'provider_cancelled', v_booking.status, 'cancelled',
    jsonb_build_object('policy_result', v_result, 'reason', v_reason)
  );

  perform private.enqueue_founder_alert(
    'cancel_provider_' || v_booking.id::text, v_booking.id, 'booking_cancelled_admin',
    jsonb_build_object('actor', 'provider', 'policy_result', v_result)
  );

  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- settle_booking_refund — record an executed/failed refund (service role)
-- ---------------------------------------------------------------------------
-- The cancellation/admin action performs the Stripe refund, then calls this by
-- the deterministic idempotency key. On success it stamps the Stripe ids and,
-- for a full refund of the payment, flips the payment to 'refunded'. Idempotent.

create function public.settle_booking_refund(
  p_idempotency_key text,
  p_status public.booking_refund_status,
  p_stripe_refund_id text default null,
  p_stripe_transfer_reversal_id text default null,
  p_failure_code text default null,
  p_failure_message text default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_refund public.booking_refunds%rowtype;
  v_payment public.booking_payments%rowtype;
begin
  if p_status not in ('succeeded', 'failed', 'processing') then
    raise exception 'INVALID_REFUND_STATUS:%', p_status;
  end if;

  select br.* into v_refund
  from public.booking_refunds br
  where br.idempotency_key = p_idempotency_key
  for update of br;
  if not found then
    return 'not_found';
  end if;
  if v_refund.status = 'succeeded' then
    return 'already_settled';
  end if;

  update public.booking_refunds
  set
    status = p_status,
    stripe_refund_id = coalesce(p_stripe_refund_id, stripe_refund_id),
    stripe_transfer_reversal_id = coalesce(p_stripe_transfer_reversal_id, stripe_transfer_reversal_id),
    failure_code = case when p_status = 'failed' then p_failure_code else failure_code end,
    failure_message = case when p_status = 'failed' then p_failure_message else failure_message end,
    succeeded_at = case when p_status = 'succeeded' then now() else succeeded_at end,
    failed_at = case when p_status = 'failed' then now() else failed_at end,
    updated_at = now()
  where id = v_refund.id;

  if p_status = 'succeeded' then
    select bp.* into v_payment
    from public.booking_payments bp
    where bp.id = v_refund.payment_id
    for update of bp;
    -- A full refund of the payment retires it; a partial leaves it succeeded.
    if v_payment.status = 'succeeded' and v_refund.amount_cents >= v_payment.amount_cents then
      update public.booking_payments set status = 'refunded', updated_at = now()
      where id = v_payment.id;
    end if;
  end if;

  insert into public.booking_audit_events (
    booking_id, actor_user_id, actor_kind, action, from_status, to_status, metadata
  )
  values (
    v_refund.booking_id, null, 'system', 'refund_' || p_status::text, null, null,
    jsonb_build_object(
      'refund_id', v_refund.id,
      'payment_id', v_refund.payment_id,
      'amount_cents', v_refund.amount_cents,
      'stripe_refund_id', p_stripe_refund_id
    )
  );
  return p_status::text;
end;
$$;

-- ---------------------------------------------------------------------------
-- reconcile_stripe_refund — repair refund state from a charge.refunded webhook
-- ---------------------------------------------------------------------------
-- Matches the payment by PaymentIntent id (any kind), settles the pending
-- booking_refunds row we created, or records a dashboard-initiated refund we
-- never authored. Idempotent on the unique Stripe refund id.

create function public.reconcile_stripe_refund(
  p_stripe_payment_intent_id text,
  p_stripe_refund_id text,
  p_amount_cents integer,
  p_reason text default 'stripe_charge_refunded'
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment public.booking_payments%rowtype;
  v_refund public.booking_refunds%rowtype;
  v_amount integer := coalesce(p_amount_cents, 0);
begin
  if coalesce(btrim(p_stripe_refund_id), '') = '' then
    return 'missing_refund_id';
  end if;

  select bp.* into v_payment
  from public.booking_payments bp
  where bp.stripe_payment_intent_id = p_stripe_payment_intent_id
  for update of bp;
  if not found then
    return 'payment_not_found';
  end if;

  -- Already recorded (our settle ran, or a prior webhook): idempotent no-op.
  if exists (
    select 1 from public.booking_refunds br where br.stripe_refund_id = p_stripe_refund_id
  ) then
    return 'already_recorded';
  end if;

  -- Settle the pending row we created for this payment, if any.
  select br.* into v_refund
  from public.booking_refunds br
  where br.payment_id = v_payment.id
    and br.stripe_refund_id is null
    and br.status in ('created', 'processing')
  order by br.created_at
  limit 1
  for update of br;

  if found then
    update public.booking_refunds
    set status = 'succeeded', stripe_refund_id = p_stripe_refund_id,
        succeeded_at = now(), updated_at = now()
    where id = v_refund.id;
  else
    insert into public.booking_refunds (
      booking_id, payment_id, amount_cents, reason, status, idempotency_key,
      stripe_refund_id, reverse_transfer, refund_application_fee, succeeded_at
    )
    values (
      v_payment.booking_id, v_payment.id, greatest(1, v_amount),
      coalesce(nullif(btrim(p_reason), ''), 'stripe_charge_refunded'),
      'succeeded', 'sr_' || p_stripe_refund_id, p_stripe_refund_id, true, true, now()
    )
    on conflict (idempotency_key) do nothing;
  end if;

  if v_payment.status = 'succeeded' and v_amount >= v_payment.amount_cents then
    update public.booking_payments set status = 'refunded', updated_at = now()
    where id = v_payment.id;
  end if;

  insert into public.booking_audit_events (
    booking_id, actor_user_id, actor_kind, action, from_status, to_status, metadata
  )
  values (
    v_payment.booking_id, null, 'stripe', 'refund_reconciled', null, null,
    jsonb_build_object(
      'payment_id', v_payment.id,
      'amount_cents', v_amount,
      'stripe_refund_id', p_stripe_refund_id
    )
  );
  return 'reconciled';
end;
$$;

-- ---------------------------------------------------------------------------
-- open_booking_dispute — customer intake; freezes autocharge (authenticated)
-- ---------------------------------------------------------------------------
-- The customer supplies only category + narrative; everything financial is
-- server-derived. A precharge dispute (booked/in_progress/invoice_review) sends
-- the booking to `disputed`, which — together with the existing balance-RPC
-- guard — freezes any autocharge. A late dispute (completed, within 7 days of
-- final charge) is recorded without touching the completed booking or money.

create function public.open_booking_dispute(
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
  v_narrative text := btrim(coalesce(p_narrative, ''));
  v_invoice public.booking_invoices%rowtype;
  v_final_charge_at timestamptz;
  v_due_at timestamptz;
  v_is_late boolean := false;
  v_dispute_id uuid;
begin
  if v_actor is null then
    raise exception 'AUTH_REQUIRED';
  end if;
  if char_length(v_narrative) < 10 or char_length(v_narrative) > 5000 then
    raise exception 'INVALID_NARRATIVE';
  end if;

  select b.* into v_booking
  from public.bookings b
  where b.id = p_booking_id and b.customer_id = v_actor
  for update of b;
  if not found then
    raise exception 'BOOKING_NOT_FOUND';
  end if;
  if v_booking.booking_flow <> 'hourly_v1' then
    raise exception 'NOT_HOURLY_BOOKING';
  end if;
  if exists (select 1 from public.booking_disputes d where d.booking_id = v_booking.id) then
    raise exception 'DISPUTE_ALREADY_OPEN';
  end if;

  select bi.* into v_invoice
  from public.booking_invoices bi
  where bi.booking_id = v_booking.id;

  if v_booking.status = 'completed' then
    -- Late dispute: only within 7 days of the final charge succeeding.
    v_final_charge_at := coalesce(
      v_invoice.resolved_at,
      (select bp.succeeded_at from public.booking_payments bp
       where bp.booking_id = v_booking.id and bp.kind = 'balance'
         and bp.status = 'succeeded')
    );
    if v_final_charge_at is null then
      raise exception 'DISPUTE_WINDOW_CLOSED';
    end if;
    if v_now > v_final_charge_at + make_interval(days => 7) then
      raise exception 'DISPUTE_WINDOW_CLOSED';
    end if;
    v_is_late := true;
    v_due_at := v_final_charge_at + make_interval(days => 7);
  elsif v_booking.status in ('booked', 'in_progress', 'invoice_review') then
    -- Precharge dispute. A no-show intake requires a passed start with no arrival.
    if p_category = 'provider_no_show' then
      if v_booking.arrived_at is not null or v_now < v_booking.scheduled_at then
        raise exception 'NO_SHOW_NOT_APPLICABLE';
      end if;
    end if;
    v_due_at := v_invoice.autocharge_at;
  else
    raise exception 'DISPUTE_NOT_ALLOWED:%', v_booking.status;
  end if;

  insert into public.booking_disputes (
    booking_id, customer_id, category, narrative, status, opened_at, dispute_due_at
  )
  values (
    v_booking.id, v_actor, p_category, v_narrative, 'open', v_now, v_due_at
  )
  returning id into v_dispute_id;

  if not v_is_late then
    perform set_config('college_crew.trusted_booking_operation', 'on', true);
    update public.bookings set status = 'disputed'
    where id = v_booking.id and status = v_booking.status;

    if v_invoice.id is not null and v_invoice.status in ('review', 'requires_action', 'processing') then
      -- Keep the invoice out of the autocharge sweep while frozen.
      update public.booking_invoices set autocharge_at = null, updated_at = now()
      where id = v_invoice.id;
    end if;
  end if;

  insert into public.booking_audit_events (
    booking_id, actor_user_id, actor_kind, action, from_status, to_status, metadata
  )
  values (
    v_booking.id, v_actor, 'customer', 'dispute_opened',
    v_booking.status, case when v_is_late then v_booking.status else 'disputed' end,
    jsonb_build_object('dispute_id', v_dispute_id, 'category', p_category, 'late', v_is_late)
  );

  perform private.enqueue_founder_alert(
    'dispute_opened_' || v_dispute_id::text, v_booking.id, 'dispute_opened_admin',
    jsonb_build_object('dispute_id', v_dispute_id, 'category', p_category)
  );

  return v_dispute_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- resolve_booking_dispute — founder resolution (admin only)
-- ---------------------------------------------------------------------------
-- Applies one of the four locked resolutions with a mandatory audit note. DB
-- effects (invoice adjustment, waive, cancel, marking the dispute resolved) run
-- here; any Stripe charge/refund is returned as a directive for the admin
-- action to execute, then settle. `outcome` is one of:
--   'resolved'         — no money movement (waive, or approve when already paid)
--   'charge_required'  — off-session balance charge for the returned amount
--   'refund_required'  — refund the returned payment by the returned key/amount

create function public.resolve_booking_dispute(
  p_booking_id uuid,
  p_resolution_kind public.booking_dispute_resolution,
  p_audit_note text,
  p_resolved_billable_minutes integer default null
)
returns table (
  outcome text,
  invoice_id uuid,
  charge_payment_id uuid,
  charge_amount_cents integer,
  charge_application_fee_cents integer,
  charge_idempotency_key text,
  refund_payment_id uuid,
  refund_amount_cents integer,
  refund_idempotency_key text
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_actor uuid := (select auth.uid());
  v_now timestamptz := statement_timestamp();
  v_note text := btrim(coalesce(p_audit_note, ''));
  v_booking public.bookings%rowtype;
  v_dispute public.booking_disputes%rowtype;
  v_invoice public.booking_invoices%rowtype;
  v_first_hour public.booking_payments%rowtype;
  v_balance public.booking_payments%rowtype;
  v_minutes integer;
  v_new_subtotal integer;
  v_new_fee integer;
  v_new_remaining integer;
  v_refund_amount integer;
  v_remaining_fee integer;
  v_key text;
  v_outcome text := 'resolved';
  v_inv_id uuid;
  v_charge_pid uuid;
  v_charge_amt integer;
  v_charge_fee integer;
  v_charge_key text;
  v_refund_pid uuid;
  v_refund_amt integer;
  v_refund_key text;
begin
  if v_actor is null or not public.is_admin() then
    raise exception 'NOT_AUTHORIZED';
  end if;
  if char_length(v_note) < 1 then
    raise exception 'AUDIT_NOTE_REQUIRED';
  end if;

  select b.* into v_booking
  from public.bookings b
  where b.id = p_booking_id
  for update of b;
  if not found then
    raise exception 'BOOKING_NOT_FOUND';
  end if;

  select d.* into v_dispute
  from public.booking_disputes d
  where d.booking_id = p_booking_id
  for update of d;
  if not found then
    raise exception 'DISPUTE_NOT_FOUND';
  end if;
  if v_dispute.status <> 'open' then
    raise exception 'DISPUTE_ALREADY_RESOLVED';
  end if;

  select bi.* into v_invoice from public.booking_invoices bi
  where bi.booking_id = p_booking_id;
  select bp.* into v_first_hour from public.booking_payments bp
  where bp.booking_id = p_booking_id and bp.kind = 'first_hour';
  select bp.* into v_balance from public.booking_payments bp
  where bp.booking_id = p_booking_id and bp.kind = 'balance';

  v_inv_id := v_invoice.id;

  -- ---- reduce_billable_minutes ------------------------------------------
  if p_resolution_kind = 'reduce_billable_minutes' then
    if v_invoice.id is null then
      raise exception 'INVOICE_REQUIRED';
    end if;
    v_minutes := p_resolved_billable_minutes;
    if v_minutes is null or v_minutes < 60 or v_minutes > 1440 or v_minutes % 15 <> 0 then
      raise exception 'INVALID_MINUTES';
    end if;
    if v_minutes >= v_invoice.submitted_minutes then
      raise exception 'REDUCTION_NOT_LOWER';
    end if;
    v_new_subtotal := ((v_invoice.hourly_rate_cents_snapshot::bigint * v_minutes + 30) / 60)::integer;
    v_new_fee := ((v_new_subtotal::bigint * v_invoice.platform_fee_bps_snapshot + 5000) / 10000)::integer;
    v_new_remaining := greatest(0, v_new_subtotal - v_invoice.first_hour_credit_cents);

    if v_invoice.status = 'paid' then
      -- Already charged: refund the difference from the balance payment.
      v_refund_amount := v_invoice.subtotal_cents - v_new_subtotal;
      if v_refund_amount > 0 and v_balance.id is not null and v_balance.status = 'succeeded' then
        v_refund_key := 'refund_reduce_' || v_booking.id::text;
        insert into public.booking_refunds (
          booking_id, payment_id, amount_cents, reason, status, idempotency_key,
          reverse_transfer, refund_application_fee
        )
        values (
          v_booking.id, v_balance.id, v_refund_amount, 'dispute_reduce_partial_refund',
          'created', v_refund_key, true, true
        )
        on conflict (idempotency_key) do nothing;
        v_outcome := 'refund_required';
        v_refund_pid := v_balance.id;
        v_refund_amt := v_refund_amount;
      end if;
    else
      -- Not yet charged: rewrite the invoice to the reduced billing, then charge.
      update public.booking_invoices
      set submitted_minutes = v_minutes,
          subtotal_cents = v_new_subtotal,
          total_platform_fee_cents = v_new_fee,
          remaining_balance_cents = v_new_remaining,
          status = 'review',
          autocharge_at = null,
          updated_at = now()
      where id = v_invoice.id;
      if v_new_remaining > 0 then
        v_remaining_fee := greatest(0, v_new_fee - v_first_hour.application_fee_cents);
        v_key := 'bal_' || v_booking.id::text || '_' || coalesce(v_balance.attempt_count + 1, 0)::text;
        if v_balance.id is null then
          insert into public.booking_payments (
            booking_id, invoice_id, kind, amount_cents, application_fee_cents, currency,
            status, idempotency_key, stripe_connected_account_id,
            customer_authorization_version, authorized_at
          )
          values (
            v_booking.id, v_invoice.id, 'balance', v_new_remaining, v_remaining_fee, 'usd',
            'created', 'bal_' || v_booking.id::text || '_0', v_first_hour.stripe_connected_account_id,
            v_first_hour.customer_authorization_version, v_now
          );
          select bp.* into v_balance from public.booking_payments bp
          where bp.booking_id = v_booking.id and bp.kind = 'balance';
        else
          update public.booking_payments
          set amount_cents = v_new_remaining, application_fee_cents = v_remaining_fee,
              status = 'created', attempt_count = (v_balance.attempt_count + 1)::smallint,
              idempotency_key = v_key, stripe_payment_intent_id = null,
              failure_code = null, failure_message = null, action_required_reason = null,
              updated_at = now()
          where id = v_balance.id;
        end if;
        v_outcome := 'charge_required';
        v_charge_pid := v_balance.id;
        v_charge_amt := v_new_remaining;
        v_charge_fee := v_remaining_fee;
        select bp.idempotency_key into v_charge_key from public.booking_payments bp where bp.id = v_balance.id;
      else
        -- Reduced to the first-hour floor: nothing left to charge, complete it.
        update public.booking_invoices set status = 'paid', resolved_at = v_now, updated_at = now()
        where id = v_invoice.id;
        perform set_config('college_crew.trusted_booking_operation', 'on', true);
        update public.bookings set status = 'completed'
        where id = v_booking.id and status = 'disputed';
      end if;
    end if;

  -- ---- waive_remaining_balance ------------------------------------------
  elsif p_resolution_kind = 'waive_remaining_balance' then
    if v_invoice.id is null then
      raise exception 'INVOICE_REQUIRED';
    end if;
    if v_invoice.status = 'paid' then
      raise exception 'NOTHING_TO_WAIVE';
    end if;
    update public.booking_invoices
    set status = 'waived', resolved_at = v_now, autocharge_at = null, updated_at = now()
    where id = v_invoice.id;
    perform set_config('college_crew.trusted_booking_operation', 'on', true);
    update public.bookings set status = 'completed'
    where id = v_booking.id and status = 'disputed';

  -- ---- cancel_and_refund ------------------------------------------------
  elsif p_resolution_kind = 'cancel_and_refund' then
    -- Refund the balance first (if captured), then the first hour.
    if v_balance.id is not null and v_balance.status = 'succeeded' then
      v_refund_key := 'refund_admin_bal_' || v_booking.id::text;
      insert into public.booking_refunds (
        booking_id, payment_id, amount_cents, reason, status, idempotency_key,
        reverse_transfer, refund_application_fee
      )
      values (
        v_booking.id, v_balance.id, v_balance.amount_cents, 'dispute_cancel_refund',
        'created', v_refund_key, true, true
      )
      on conflict (idempotency_key) do nothing;
      v_outcome := 'refund_required';
      v_refund_pid := v_balance.id;
      v_refund_amt := v_balance.amount_cents;
    end if;
    if v_first_hour.id is not null and v_first_hour.status = 'succeeded' then
      insert into public.booking_refunds (
        booking_id, payment_id, amount_cents, reason, status, idempotency_key,
        reverse_transfer, refund_application_fee
      )
      values (
        v_booking.id, v_first_hour.id, v_first_hour.amount_cents, 'dispute_cancel_refund',
        'created', 'refund_admin_fh_' || v_booking.id::text, true, true
      )
      on conflict (idempotency_key) do nothing;
      if v_outcome = 'resolved' then
        v_outcome := 'refund_required';
        v_refund_pid := v_first_hour.id;
        v_refund_amt := v_first_hour.amount_cents;
      end if;
    end if;
    -- A precharge dispute cancels the booking; a completed (late) dispute keeps
    -- its completed state and only reverses money.
    if v_booking.status = 'disputed' then
      if v_invoice.id is not null then
        update public.booking_invoices set status = 'refunded', resolved_at = v_now, updated_at = now()
        where id = v_invoice.id;
      end if;
      perform set_config('college_crew.trusted_booking_operation', 'on', true);
      update public.bookings
      set status = 'cancelled', cancelled_at = coalesce(cancelled_at, v_now),
          cancelled_by = coalesce(cancelled_by, v_actor),
          cancelled_by_role = coalesce(cancelled_by_role, 'admin'),
          cancellation_reason = coalesce(cancellation_reason, 'dispute_cancel_refund'),
          cancellation_policy_result = coalesce(cancellation_policy_result, 'full_refund')
      where id = v_booking.id and status = 'disputed';
    end if;

  -- ---- approve_submitted_hours ------------------------------------------
  elsif p_resolution_kind = 'approve_submitted_hours' then
    if v_invoice.id is not null and v_invoice.status not in ('paid', 'waived')
       and v_invoice.remaining_balance_cents > 0 then
      -- Charge the outstanding balance as approved.
      v_remaining_fee := greatest(0, v_invoice.total_platform_fee_cents - v_first_hour.application_fee_cents);
      update public.booking_invoices set status = 'review', autocharge_at = null, updated_at = now()
      where id = v_invoice.id;
      if v_balance.id is null then
        insert into public.booking_payments (
          booking_id, invoice_id, kind, amount_cents, application_fee_cents, currency,
          status, idempotency_key, stripe_connected_account_id,
          customer_authorization_version, authorized_at
        )
        values (
          v_booking.id, v_invoice.id, 'balance', v_invoice.remaining_balance_cents, v_remaining_fee, 'usd',
          'created', 'bal_' || v_booking.id::text || '_0', v_first_hour.stripe_connected_account_id,
          v_first_hour.customer_authorization_version, v_now
        );
        select bp.* into v_balance from public.booking_payments bp
        where bp.booking_id = v_booking.id and bp.kind = 'balance';
      else
        update public.booking_payments
        set amount_cents = v_invoice.remaining_balance_cents, application_fee_cents = v_remaining_fee,
            status = 'created', attempt_count = (v_balance.attempt_count + 1)::smallint,
            idempotency_key = 'bal_' || v_booking.id::text || '_' || (v_balance.attempt_count + 1)::text,
            stripe_payment_intent_id = null, failure_code = null, failure_message = null,
            action_required_reason = null, updated_at = now()
        where id = v_balance.id;
      end if;
      v_outcome := 'charge_required';
      v_charge_pid := v_balance.id;
      v_charge_amt := v_invoice.remaining_balance_cents;
      v_charge_fee := v_remaining_fee;
      select bp.idempotency_key into v_charge_key from public.booking_payments bp where bp.id = v_balance.id;
    else
      -- Already paid / nothing due (includes late disputes): leave money as-is.
      if v_booking.status = 'disputed' and v_invoice.id is not null then
        if v_invoice.status not in ('paid', 'waived', 'refunded') then
          update public.booking_invoices set status = 'paid', resolved_at = v_now, updated_at = now()
          where id = v_invoice.id;
        end if;
        perform set_config('college_crew.trusted_booking_operation', 'on', true);
        update public.bookings set status = 'completed'
        where id = v_booking.id and status = 'disputed';
      end if;
    end if;
  else
    raise exception 'UNKNOWN_RESOLUTION:%', p_resolution_kind;
  end if;

  -- Mark the dispute resolved with the mandatory audit note. The resolved row
  -- persists; the balance guard is fine because the customer never re-charges.
  update public.booking_disputes
  set status = 'resolved', resolution_kind = p_resolution_kind,
      resolved_billable_minutes = case when p_resolution_kind = 'reduce_billable_minutes'
        then v_minutes else null end,
      resolver_id = v_actor, resolved_at = v_now, audit_note = v_note
  where id = v_dispute.id;

  insert into public.booking_audit_events (
    booking_id, actor_user_id, actor_kind, action, from_status, to_status, metadata
  )
  values (
    v_booking.id, v_actor, 'admin', 'dispute_resolved', null, null,
    jsonb_build_object(
      'dispute_id', v_dispute.id,
      'resolution_kind', p_resolution_kind,
      'outcome', v_outcome,
      'resolved_billable_minutes', v_minutes,
      'note', v_note
    )
  );

  return query select v_outcome, v_inv_id, v_charge_pid, v_charge_amt, v_charge_fee,
    v_charge_key, v_refund_pid, v_refund_amt, v_refund_key;
end;
$$;

-- ---------------------------------------------------------------------------
-- settle_balance_payment — widen completion to admin-charged disputes
-- ---------------------------------------------------------------------------
-- Marks the balance payment succeeded (money is real) and completes the booking
-- from either invoice_review (normal) or disputed (admin approval charge). An
-- OPEN dispute still defers completion so a payment that races a fresh dispute
-- cannot silently finish the booking.

create or replace function public.settle_balance_payment(
  p_stripe_payment_intent_id text,
  p_succeeded_at timestamptz default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment public.booking_payments%rowtype;
  v_booking public.bookings%rowtype;
  v_succeeded_at timestamptz := coalesce(p_succeeded_at, statement_timestamp());
  v_dispute_open boolean;
begin
  select bp.* into v_payment
  from public.booking_payments bp
  where bp.stripe_payment_intent_id = p_stripe_payment_intent_id
    and bp.kind = 'balance';
  if not found then
    return 'not_found';
  end if;

  select b.* into v_booking
  from public.bookings b
  where b.id = v_payment.booking_id
  for update of b;

  if v_booking.status = 'completed' and v_payment.status = 'succeeded' then
    return 'already_completed';
  end if;

  if v_payment.status <> 'succeeded' then
    update public.booking_payments
    set status = 'succeeded', succeeded_at = v_succeeded_at, updated_at = now()
    where id = v_payment.id;
  end if;

  select exists (
    select 1 from public.booking_disputes d
    where d.booking_id = v_booking.id and d.status = 'open'
  ) into v_dispute_open;

  -- Complete from invoice_review (normal) or disputed (admin approval charge),
  -- but never while a dispute is still open.
  if v_dispute_open or v_booking.status not in ('invoice_review', 'disputed') then
    return 'settled_no_transition';
  end if;

  update public.booking_invoices
  set status = 'paid', resolved_at = v_succeeded_at, updated_at = now()
  where id = v_payment.invoice_id;

  perform set_config('college_crew.trusted_booking_operation', 'on', true);
  update public.bookings
  set status = 'completed'
  where id = v_booking.id and status in ('invoice_review', 'disputed');

  insert into public.booking_audit_events (
    booking_id, actor_user_id, actor_kind, action, from_status, to_status, metadata
  )
  values (
    v_booking.id, null, 'stripe', 'balance_payment_succeeded', v_booking.status, 'completed',
    jsonb_build_object(
      'payment_id', v_payment.id,
      'invoice_id', v_payment.invoice_id,
      'stripe_payment_intent_id', p_stripe_payment_intent_id,
      'succeeded_at', v_succeeded_at
    )
  );
  return 'completed';
end;
$$;

-- ---------------------------------------------------------------------------
-- stripe_disputes — external card-network disputes (server-only)
-- ---------------------------------------------------------------------------
-- Recorded from charge.dispute.* webhooks and read-only in admin. Kept strictly
-- separate from internal booking_disputes: an internal resolution never claims a
-- card dispute is closed, and vice versa.

create table public.stripe_disputes (
  id uuid primary key default gen_random_uuid(),
  stripe_dispute_id text not null unique,
  stripe_charge_id text,
  stripe_payment_intent_id text,
  booking_id uuid references public.bookings (id) on delete set null,
  payment_id uuid references public.booking_payments (id) on delete set null,
  amount_cents integer,
  currency text,
  reason text,
  status text,
  evidence_due_by timestamptz,
  is_charge_refundable boolean,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index stripe_disputes_status_idx on public.stripe_disputes (status);
create index stripe_disputes_booking_id_idx
  on public.stripe_disputes (booking_id) where booking_id is not null;

alter table public.stripe_disputes enable row level security;
revoke all on table public.stripe_disputes from anon, authenticated;
grant all on table public.stripe_disputes to service_role;

-- ---------------------------------------------------------------------------
-- record_stripe_dispute — upsert an external card dispute (service role)
-- ---------------------------------------------------------------------------

create function public.record_stripe_dispute(p_event jsonb)
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
  end if;

  return 'recorded';
end;
$$;

-- ---------------------------------------------------------------------------
-- Least-privilege execute grants (SECURITY DEFINER routines default to PUBLIC)
-- ---------------------------------------------------------------------------

revoke execute on function public.cancel_booking_as_customer(uuid) from public, anon;
grant execute on function public.cancel_booking_as_customer(uuid) to authenticated;

revoke execute on function public.cancel_booking_as_provider(uuid, text) from public, anon;
grant execute on function public.cancel_booking_as_provider(uuid, text) to authenticated;

revoke execute on function public.open_booking_dispute(
  uuid, public.booking_dispute_category, text
) from public, anon;
grant execute on function public.open_booking_dispute(
  uuid, public.booking_dispute_category, text
) to authenticated;

revoke execute on function public.resolve_booking_dispute(
  uuid, public.booking_dispute_resolution, text, integer
) from public, anon;
grant execute on function public.resolve_booking_dispute(
  uuid, public.booking_dispute_resolution, text, integer
) to authenticated;

revoke execute on function public.settle_booking_refund(
  text, public.booking_refund_status, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.settle_booking_refund(
  text, public.booking_refund_status, text, text, text, text
) to service_role;

revoke execute on function public.reconcile_stripe_refund(text, text, integer, text)
  from public, anon, authenticated;
grant execute on function public.reconcile_stripe_refund(text, text, integer, text)
  to service_role;

revoke execute on function public.record_stripe_dispute(jsonb)
  from public, anon, authenticated;
grant execute on function public.record_stripe_dispute(jsonb) to service_role;

revoke execute on function public.settle_balance_payment(text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.settle_balance_payment(text, timestamptz) to service_role;
