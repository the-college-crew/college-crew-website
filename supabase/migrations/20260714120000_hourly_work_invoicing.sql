-- Hourly Booking v1 — Phase 5: work tracking and final invoice.
--
-- Builds the post-booking lifecycle on top of the Phase 1 substrate (the
-- booking_invoices / booking_payments 'balance' scaffold, the immutable
-- arrived_at / work_completed_at columns, and the booked -> in_progress ->
-- invoice_review -> completed transitions already allowed by
-- enforce_booking_transition). This migration adds only:
--   * one additive booking_payments column for balance retry keys, and
--   * the trusted domain RPCs the provider/customer actions, the recovery
--     domain op, and the Stripe webhook call.
--
-- Booking state moves to `completed` ONLY from settle_balance_payment /
-- settle_zero_balance_invoice. Failed/action-required balance charges leave the
-- booking in invoice_review so the customer can recover.

-- ---------------------------------------------------------------------------
-- Additive: balance-charge retry attempt counter (drives idempotency keys)
-- ---------------------------------------------------------------------------

alter table public.booking_payments
  add column attempt_count smallint not null default 0;

-- ---------------------------------------------------------------------------
-- mark_booking_arrived — provider taps Arrived (authenticated provider)
-- ---------------------------------------------------------------------------
-- booked -> in_progress with an immutable server arrival timestamp. Allows a
-- 30-minute grace before the scheduled start; rejects earlier/wrong-status.
-- Idempotent: a second tap while already in_progress is a no-op.

create function public.mark_booking_arrived(p_booking_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_now timestamptz := statement_timestamp();
  v_booking public.bookings%rowtype;
begin
  if v_actor is null then
    raise exception 'AUTH_REQUIRED';
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
  if v_booking.status = 'in_progress' then
    return 'in_progress';
  end if;
  if v_booking.status <> 'booked' then
    raise exception 'BOOKING_NOT_BOOKED:%', v_booking.status;
  end if;
  if v_now < v_booking.scheduled_at - interval '30 minutes' then
    raise exception 'ARRIVAL_TOO_EARLY';
  end if;

  perform set_config('college_crew.trusted_booking_operation', 'on', true);
  update public.bookings
  set status = 'in_progress', arrived_at = v_now
  where id = p_booking_id and status = 'booked';

  insert into public.booking_audit_events (
    booking_id, actor_user_id, actor_kind, action, from_status, to_status, metadata
  )
  values (
    p_booking_id, v_actor, 'provider', 'provider_arrived', 'booked', 'in_progress',
    jsonb_build_object('arrived_at', v_now, 'scheduled_at', v_booking.scheduled_at)
  );
  return 'in_progress';
end;
$$;

-- ---------------------------------------------------------------------------
-- submit_job_invoice — Job Complete + invoice (authenticated provider)
-- ---------------------------------------------------------------------------
-- in_progress -> invoice_review with an immutable work_completed_at, one
-- booking_invoices row (money computed identically to the table's money CHECK),
-- and a 24h autocharge deadline. Idempotent via booking_invoices.booking_id
-- unique: a resubmission returns the existing invoice unchanged.

create function public.submit_job_invoice(
  p_booking_id uuid,
  p_submitted_minutes integer,
  p_provider_explanation text
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
  v_existing uuid;
  v_explanation text := coalesce(btrim(p_provider_explanation), '');
  v_rate integer;
  v_bps smallint;
  v_subtotal integer;
  v_total_fee integer;
  v_remaining integer;
  v_invoice_id uuid;
begin
  if v_actor is null then
    raise exception 'AUTH_REQUIRED';
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

  -- Idempotent resubmission: an invoice already exists for this booking.
  select bi.id into v_existing
  from public.booking_invoices bi
  where bi.booking_id = p_booking_id;
  if v_existing is not null then
    return v_existing;
  end if;

  if v_booking.status <> 'in_progress' then
    raise exception 'BOOKING_NOT_IN_PROGRESS:%', v_booking.status;
  end if;
  if p_submitted_minutes < 60 or p_submitted_minutes > 1440
    or p_submitted_minutes % 15 <> 0 then
    raise exception 'INVALID_MINUTES:%', p_submitted_minutes;
  end if;
  if p_submitted_minutes > v_booking.estimated_minutes and v_explanation = '' then
    raise exception 'OVERAGE_EXPLANATION_REQUIRED';
  end if;

  v_rate := v_booking.hourly_rate_cents_snapshot;
  v_bps := v_booking.platform_fee_bps;
  -- Exact master-plan formula; identical to booking_invoices_money_valid.
  v_subtotal := ((v_rate::bigint * p_submitted_minutes + 30) / 60)::integer;
  v_total_fee := ((v_subtotal::bigint * v_bps + 5000) / 10000)::integer;
  v_remaining := greatest(0, v_subtotal - v_rate);

  perform set_config('college_crew.trusted_booking_operation', 'on', true);
  update public.bookings
  set status = 'invoice_review', work_completed_at = v_now
  where id = p_booking_id and status = 'in_progress';

  insert into public.booking_invoices (
    booking_id, submitted_minutes, estimated_minutes_snapshot,
    hourly_rate_cents_snapshot, platform_fee_bps_snapshot, provider_explanation,
    subtotal_cents, total_platform_fee_cents, first_hour_credit_cents,
    remaining_balance_cents, status, submitted_at, autocharge_at
  )
  values (
    p_booking_id, p_submitted_minutes, v_booking.estimated_minutes,
    v_rate, v_bps, v_explanation,
    v_subtotal, v_total_fee, v_rate,
    v_remaining, 'review', v_now, v_now + interval '24 hours'
  )
  returning id into v_invoice_id;

  insert into public.booking_audit_events (
    booking_id, actor_user_id, actor_kind, action, from_status, to_status, metadata
  )
  values (
    p_booking_id, v_actor, 'provider', 'job_completed_invoice_submitted',
    'in_progress', 'invoice_review',
    jsonb_build_object(
      'invoice_id', v_invoice_id,
      'submitted_minutes', p_submitted_minutes,
      'subtotal_cents', v_subtotal,
      'remaining_balance_cents', v_remaining
    )
  );
  return v_invoice_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- begin_balance_payment — customer prepares the remaining-balance attempt
-- ---------------------------------------------------------------------------
-- Idempotently persists exactly one `balance` booking_payments row BEFORE any
-- Stripe call. Returns only the caller's own financials; Stripe ids and the
-- provider connected account stay server-only (the action reads them via the
-- admin client after this RPC authorizes). Blocks a charge when a dispute
-- exists (the domain guard for the Phase 6 dispute entry point).

create function public.begin_balance_payment(p_invoice_id uuid)
returns table (
  payment_id uuid,
  idempotency_key text,
  amount_cents integer,
  application_fee_cents integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_now timestamptz := statement_timestamp();
  v_invoice public.booking_invoices%rowtype;
  v_booking public.bookings%rowtype;
  v_first_hour public.booking_payments%rowtype;
  v_remaining_fee integer;
  v_key text;
  v_payment public.booking_payments%rowtype;
begin
  if v_actor is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  select bi.* into v_invoice
  from public.booking_invoices bi
  where bi.id = p_invoice_id;
  if not found then
    raise exception 'INVOICE_NOT_FOUND';
  end if;

  select b.* into v_booking
  from public.bookings b
  where b.id = v_invoice.booking_id and b.customer_id = v_actor
  for update of b;
  if not found then
    raise exception 'BOOKING_NOT_FOUND';
  end if;
  if v_booking.status <> 'invoice_review' then
    raise exception 'BOOKING_NOT_IN_REVIEW:%', v_booking.status;
  end if;
  if v_invoice.status not in ('review', 'requires_action') then
    raise exception 'INVOICE_NOT_PAYABLE:%', v_invoice.status;
  end if;
  if v_invoice.remaining_balance_cents <= 0 then
    raise exception 'NO_BALANCE_DUE';
  end if;
  if exists (select 1 from public.booking_disputes d where d.booking_id = v_booking.id) then
    raise exception 'DISPUTE_OPEN';
  end if;

  select bp.* into v_first_hour
  from public.booking_payments bp
  where bp.booking_id = v_booking.id and bp.kind = 'first_hour';
  if not found then
    raise exception 'FIRST_HOUR_PAYMENT_MISSING';
  end if;

  -- Split-fee remainder = total fee less the fee already collected first hour.
  v_remaining_fee := greatest(0, v_invoice.total_platform_fee_cents - v_first_hour.application_fee_cents);
  v_key := 'bal_' || v_booking.id::text || '_0';

  insert into public.booking_payments (
    booking_id, invoice_id, kind, amount_cents, application_fee_cents, currency,
    status, idempotency_key, stripe_connected_account_id,
    customer_authorization_version, authorized_at
  )
  values (
    v_booking.id, v_invoice.id, 'balance', v_invoice.remaining_balance_cents,
    v_remaining_fee, 'usd', 'created', v_key, v_first_hour.stripe_connected_account_id,
    v_first_hour.customer_authorization_version, v_now
  )
  on conflict (booking_id, kind) do nothing;

  if found then
    insert into public.booking_audit_events (
      booking_id, actor_user_id, actor_kind, action, from_status, to_status, metadata
    )
    values (
      v_booking.id, v_actor, 'customer', 'balance_payment_initiated',
      v_booking.status, v_booking.status,
      jsonb_build_object(
        'invoice_id', v_invoice.id,
        'amount_cents', v_invoice.remaining_balance_cents,
        'application_fee_cents', v_remaining_fee
      )
    );
  end if;

  select bp.* into v_payment
  from public.booking_payments bp
  where bp.booking_id = v_booking.id and bp.kind = 'balance';

  return query
  select v_payment.id, v_payment.idempotency_key, v_payment.amount_cents,
         v_payment.application_fee_cents;
end;
$$;

-- ---------------------------------------------------------------------------
-- attach_balance_payment_intent — record the balance PaymentIntent id
-- ---------------------------------------------------------------------------
-- Authenticated customer or the service role (recovery / scheduled charge).
-- Writes the PI id while the attempt is not already succeeded/processing, so a
-- retry with a fresh intent overwrites the stale one.

create function public.attach_balance_payment_intent(
  p_invoice_id uuid,
  p_stripe_payment_intent_id text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
begin
  update public.booking_payments bp
  set
    stripe_payment_intent_id = p_stripe_payment_intent_id,
    updated_at = now()
  from public.bookings b
  where bp.invoice_id = p_invoice_id
    and bp.kind = 'balance'
    and b.id = bp.booking_id
    and bp.status in ('created', 'failed', 'requires_action', 'cancelled')
    and (v_actor is null or b.customer_id = v_actor);
  if not found then
    raise exception 'PAYMENT_NOT_ATTACHABLE';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- reset_balance_payment_for_retry — recover a failed/action-required balance
-- ---------------------------------------------------------------------------
-- Bumps the attempt counter (new idempotency key), clears the stale intent and
-- failure context, and returns the attempt to `created`. Guarded against a
-- succeeded/processing payment so recovery can never double-charge.

create function public.reset_balance_payment_for_retry(p_invoice_id uuid)
returns table (
  idempotency_key text,
  amount_cents integer,
  application_fee_cents integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_payment public.booking_payments%rowtype;
  v_next smallint;
  v_key text;
begin
  if v_actor is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  select bp.* into v_payment
  from public.booking_payments bp
  join public.bookings b on b.id = bp.booking_id
  where bp.invoice_id = p_invoice_id
    and bp.kind = 'balance'
    and b.customer_id = v_actor
  for update of bp;
  if not found then
    raise exception 'PAYMENT_NOT_FOUND';
  end if;
  if v_payment.status = 'succeeded' then
    raise exception 'ALREADY_PAID';
  end if;
  if v_payment.status = 'processing' then
    raise exception 'PAYMENT_PROCESSING';
  end if;

  v_next := (v_payment.attempt_count + 1)::smallint;
  v_key := 'bal_' || v_payment.booking_id::text || '_' || v_next::text;

  update public.booking_payments
  set
    attempt_count = v_next,
    idempotency_key = v_key,
    status = 'created',
    stripe_payment_intent_id = null,
    failure_code = null,
    failure_message = null,
    action_required_reason = null,
    updated_at = now()
  where id = v_payment.id;

  insert into public.booking_audit_events (
    booking_id, actor_user_id, actor_kind, action, from_status, to_status, metadata
  )
  values (
    v_payment.booking_id, v_actor, 'customer', 'balance_payment_retry_reset', null, null,
    jsonb_build_object('invoice_id', p_invoice_id, 'attempt_count', v_next)
  );

  return query
  select v_key, v_payment.amount_cents, v_payment.application_fee_cents;
end;
$$;

-- ---------------------------------------------------------------------------
-- settle_zero_balance_invoice — complete a no-balance invoice with no charge
-- ---------------------------------------------------------------------------
-- Customer confirmation or the scheduled charge for an invoice whose remaining
-- balance is zero. Marks the invoice paid and moves invoice_review -> completed
-- without any Stripe call, preserving refund/dispute auditability.

create function public.settle_zero_balance_invoice(p_invoice_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_now timestamptz := statement_timestamp();
  v_invoice public.booking_invoices%rowtype;
  v_booking public.bookings%rowtype;
begin
  select bi.* into v_invoice
  from public.booking_invoices bi
  where bi.id = p_invoice_id;
  if not found then
    raise exception 'INVOICE_NOT_FOUND';
  end if;

  select b.* into v_booking
  from public.bookings b
  where b.id = v_invoice.booking_id
  for update of b;

  -- Authenticated callers must be the booking customer; service role is free.
  if v_actor is not null and v_booking.customer_id <> v_actor then
    raise exception 'NOT_AUTHORIZED';
  end if;
  if v_invoice.remaining_balance_cents <> 0 then
    raise exception 'BALANCE_DUE';
  end if;
  if v_booking.status = 'completed' and v_invoice.status = 'paid' then
    return 'already_completed';
  end if;
  if v_booking.status <> 'invoice_review' then
    raise exception 'BOOKING_NOT_IN_REVIEW:%', v_booking.status;
  end if;
  if exists (select 1 from public.booking_disputes d where d.booking_id = v_booking.id) then
    raise exception 'DISPUTE_OPEN';
  end if;

  update public.booking_invoices
  set status = 'paid',
      customer_confirmed_at = coalesce(customer_confirmed_at, case when v_actor is not null then v_now else customer_confirmed_at end),
      resolved_at = v_now,
      updated_at = now()
  where id = v_invoice.id;

  perform set_config('college_crew.trusted_booking_operation', 'on', true);
  update public.bookings
  set status = 'completed'
  where id = v_booking.id and status = 'invoice_review';

  insert into public.booking_audit_events (
    booking_id, actor_user_id, actor_kind, action, from_status, to_status, metadata
  )
  values (
    v_booking.id, v_actor, case when v_actor is null then 'system' else 'customer' end,
    'invoice_settled_zero_balance', 'invoice_review', 'completed',
    jsonb_build_object('invoice_id', v_invoice.id)
  );
  return 'completed';
end;
$$;

-- ---------------------------------------------------------------------------
-- claim_due_invoice — single-flight claim for the scheduled balance charge
-- ---------------------------------------------------------------------------
-- Service role only (the attemptDueInvoiceCharge domain op). Atomically claims
-- a review invoice past its autocharge deadline with no open dispute, ensures a
-- balance payment row exists, flips the invoice to `processing`, and returns the
-- saved method + connected account needed to confirm off-session. Returns no
-- rows when the invoice is not claimable.

create function public.claim_due_invoice(p_invoice_id uuid)
returns table (
  payment_id uuid,
  booking_id uuid,
  idempotency_key text,
  amount_cents integer,
  application_fee_cents integer,
  stripe_customer_id text,
  stripe_payment_method_id text,
  stripe_connected_account_id text
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_now timestamptz := statement_timestamp();
  v_invoice public.booking_invoices%rowtype;
  v_booking public.bookings%rowtype;
  v_first_hour public.booking_payments%rowtype;
  v_remaining_fee integer;
  v_key text;
  v_payment public.booking_payments%rowtype;
begin
  select bi.* into v_invoice
  from public.booking_invoices bi
  where bi.id = p_invoice_id
  for update of bi;
  if not found then
    return;
  end if;
  if v_invoice.status <> 'review'
    or v_invoice.remaining_balance_cents <= 0
    or v_invoice.autocharge_at is null
    or v_now < v_invoice.autocharge_at then
    return;
  end if;

  select b.* into v_booking
  from public.bookings b
  where b.id = v_invoice.booking_id
  for update of b;
  if v_booking.status <> 'invoice_review' then
    return;
  end if;
  if exists (select 1 from public.booking_disputes d where d.booking_id = v_booking.id) then
    return;
  end if;

  select bp.* into v_first_hour
  from public.booking_payments bp
  where bp.booking_id = v_booking.id and bp.kind = 'first_hour';
  if not found then
    return;
  end if;

  v_remaining_fee := greatest(0, v_invoice.total_platform_fee_cents - v_first_hour.application_fee_cents);
  v_key := 'bal_' || v_booking.id::text || '_0';

  insert into public.booking_payments (
    booking_id, invoice_id, kind, amount_cents, application_fee_cents, currency,
    status, idempotency_key, stripe_connected_account_id,
    customer_authorization_version, authorized_at
  )
  values (
    v_booking.id, v_invoice.id, 'balance', v_invoice.remaining_balance_cents,
    v_remaining_fee, 'usd', 'created', v_key, v_first_hour.stripe_connected_account_id,
    v_first_hour.customer_authorization_version, v_now
  )
  on conflict (booking_id, kind) do nothing;

  select bp.* into v_payment
  from public.booking_payments bp
  where bp.booking_id = v_booking.id and bp.kind = 'balance';
  if v_payment.status in ('succeeded', 'processing') then
    return;
  end if;

  update public.booking_invoices
  set status = 'processing', updated_at = now()
  where id = v_invoice.id;

  insert into public.booking_audit_events (
    booking_id, actor_user_id, actor_kind, action, from_status, to_status, metadata
  )
  values (
    v_booking.id, null, 'system', 'balance_autocharge_claimed', null, null,
    jsonb_build_object('invoice_id', v_invoice.id, 'amount_cents', v_payment.amount_cents)
  );

  return query
  select v_payment.id, v_booking.id, v_payment.idempotency_key, v_payment.amount_cents,
         v_payment.application_fee_cents, v_first_hour.stripe_customer_id,
         v_first_hour.stripe_payment_method_id, v_first_hour.stripe_connected_account_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- settle_balance_payment — webhook source of truth (service role)
-- ---------------------------------------------------------------------------
-- Marks the balance payment succeeded, the invoice paid, and moves
-- invoice_review -> completed. Idempotent; duplicate events cannot double-settle.

create function public.settle_balance_payment(
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

  -- A dispute or non-review state defers completion to Phase 6 handling.
  if v_booking.status <> 'invoice_review' then
    return 'settled_no_transition';
  end if;

  update public.booking_invoices
  set status = 'paid', resolved_at = v_succeeded_at, updated_at = now()
  where id = v_payment.invoice_id;

  perform set_config('college_crew.trusted_booking_operation', 'on', true);
  update public.bookings
  set status = 'completed'
  where id = v_booking.id and status = 'invoice_review';

  insert into public.booking_audit_events (
    booking_id, actor_user_id, actor_kind, action, from_status, to_status, metadata
  )
  values (
    v_booking.id, null, 'stripe', 'balance_payment_succeeded', 'invoice_review', 'completed',
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
-- mark_balance_payment_unsuccessful — failure / action-required (service role)
-- ---------------------------------------------------------------------------
-- Records the failure on the payment and flags the invoice requires_action,
-- leaving the booking in invoice_review so recovery can retry.

create function public.mark_balance_payment_unsuccessful(
  p_stripe_payment_intent_id text,
  p_target_status public.booking_payment_status,
  p_failure_code text default null,
  p_failure_message text default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment public.booking_payments%rowtype;
begin
  if p_target_status not in ('failed', 'cancelled', 'requires_action') then
    raise exception 'INVALID_TARGET_STATUS:%', p_target_status;
  end if;

  select bp.* into v_payment
  from public.booking_payments bp
  where bp.stripe_payment_intent_id = p_stripe_payment_intent_id
    and bp.kind = 'balance';
  if not found then
    return 'not_found';
  end if;
  if v_payment.status = 'succeeded' then
    return 'already_succeeded';
  end if;

  update public.booking_payments
  set
    status = p_target_status,
    failure_code = p_failure_code,
    failure_message = p_failure_message,
    action_required_reason = case when p_target_status = 'requires_action'
      then coalesce(p_failure_message, 'authentication_required') else action_required_reason end,
    failed_at = case when p_target_status in ('failed', 'cancelled') then now() else failed_at end,
    updated_at = now()
  where id = v_payment.id;

  update public.booking_invoices
  set status = 'requires_action', updated_at = now()
  where id = v_payment.invoice_id
    and status in ('review', 'processing', 'requires_action');

  insert into public.booking_audit_events (
    booking_id, actor_user_id, actor_kind, action, from_status, to_status, metadata
  )
  values (
    v_payment.booking_id, null, 'stripe', 'balance_payment_' || p_target_status::text, null, null,
    jsonb_build_object(
      'payment_id', v_payment.id,
      'invoice_id', v_payment.invoice_id,
      'stripe_payment_intent_id', p_stripe_payment_intent_id,
      'failure_code', p_failure_code
    )
  );
  return p_target_status::text;
end;
$$;

-- ---------------------------------------------------------------------------
-- Least-privilege execute grants (SECURITY DEFINER routines default to PUBLIC)
-- ---------------------------------------------------------------------------

revoke execute on function public.mark_booking_arrived(uuid) from public, anon;
grant execute on function public.mark_booking_arrived(uuid) to authenticated;

revoke execute on function public.submit_job_invoice(uuid, integer, text) from public, anon;
grant execute on function public.submit_job_invoice(uuid, integer, text) to authenticated;

revoke execute on function public.begin_balance_payment(uuid) from public, anon;
grant execute on function public.begin_balance_payment(uuid) to authenticated;

revoke execute on function public.attach_balance_payment_intent(uuid, text) from public, anon;
grant execute on function public.attach_balance_payment_intent(uuid, text)
  to authenticated, service_role;

revoke execute on function public.reset_balance_payment_for_retry(uuid) from public, anon;
grant execute on function public.reset_balance_payment_for_retry(uuid) to authenticated;

revoke execute on function public.settle_zero_balance_invoice(uuid) from public, anon;
grant execute on function public.settle_zero_balance_invoice(uuid)
  to authenticated, service_role;

revoke execute on function public.claim_due_invoice(uuid)
  from public, anon, authenticated;
grant execute on function public.claim_due_invoice(uuid) to service_role;

revoke execute on function public.settle_balance_payment(text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.settle_balance_payment(text, timestamptz) to service_role;

revoke execute on function public.mark_balance_payment_unsuccessful(
  text, public.booking_payment_status, text, text
) from public, anon, authenticated;
grant execute on function public.mark_balance_payment_unsuccessful(
  text, public.booking_payment_status, text, text
) to service_role;
