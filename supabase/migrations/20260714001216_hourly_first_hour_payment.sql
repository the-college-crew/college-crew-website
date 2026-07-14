-- Hourly Booking v1 — Phase 4: acceptance to first-hour payment.
--
-- Wires the payment boundary that turns an accepted hourly request into a
-- `booked` job. All money/lifecycle tables (booking_payments, booking_refunds,
-- stripe_webhook_receipts, booking_audit_events) already exist from the Phase 1
-- data/security migration; this migration only adds:
--   * a server-only Stripe Customer mapping table, and
--   * the trusted domain RPCs the confirm action and the Stripe webhook call.
--
-- Booking state is moved to `booked` ONLY by the webhook-confirmed
-- settle_first_hour_payment RPC (service role). Late/terminal successes are
-- recorded and flagged for refund without reviving the booking.

-- ---------------------------------------------------------------------------
-- Server-only Stripe Customer mapping (one Stripe Customer per CC customer)
-- ---------------------------------------------------------------------------

create table public.stripe_customers (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  stripe_customer_id text not null unique,
  created_at timestamptz not null default now(),

  constraint stripe_customers_id_not_blank check (btrim(stripe_customer_id) <> '')
);

alter table public.stripe_customers enable row level security;

-- Stripe Customer IDs are private financial identifiers: never browser-readable.
revoke all on table public.stripe_customers from anon, authenticated;
grant all on table public.stripe_customers to service_role;

-- ---------------------------------------------------------------------------
-- begin_first_hour_payment — authenticated customer prepares the attempt
-- ---------------------------------------------------------------------------
-- Idempotently persists exactly one first-hour booking_payments row (unique on
-- (booking_id, kind)) with a deterministic idempotency key BEFORE any Stripe
-- call, so a refresh/double-submit cannot spawn a second charge. Does not
-- transition the booking, so it needs no trusted-transition marker.

create function public.begin_first_hour_payment(
  p_booking_id uuid,
  p_authorization_version text
)
-- Returns only the caller's own booking financials. The provider connected
-- account id and any Stripe customer/PaymentIntent ids stay server-only (this
-- RPC is PostgREST-exposed to `authenticated`), so they are never returned here.
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
  v_booking public.bookings%rowtype;
  v_connected_account text;
  v_fee_cents integer;
  v_key text;
  v_payment public.booking_payments%rowtype;
begin
  if v_actor is null then
    raise exception 'AUTH_REQUIRED';
  end if;
  if coalesce(btrim(p_authorization_version), '') = '' then
    raise exception 'AUTHORIZATION_VERSION_REQUIRED';
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
  if v_booking.status <> 'accepted' then
    raise exception 'BOOKING_NOT_AWAITING_PAYMENT:%', v_booking.status;
  end if;
  if v_booking.initial_payment_due_at is null
    or v_now >= v_booking.initial_payment_due_at then
    raise exception 'PAYMENT_WINDOW_CLOSED';
  end if;

  select pp.stripe_account_id into v_connected_account
  from public.provider_profiles pp
  where pp.id = v_booking.provider_id;
  if coalesce(btrim(v_connected_account), '') = '' then
    raise exception 'PROVIDER_NOT_PAYOUT_READY';
  end if;

  -- Mirrors calculatePlatformFeeCents(hourly_rate, 500) — round half up.
  v_fee_cents :=
    ((v_booking.hourly_rate_cents_snapshot::bigint * 500 + 5000) / 10000)::integer;
  v_key := 'fh_' || p_booking_id::text;

  insert into public.booking_payments (
    booking_id,
    kind,
    amount_cents,
    application_fee_cents,
    currency,
    status,
    idempotency_key,
    stripe_connected_account_id,
    customer_authorization_version,
    authorized_at
  )
  values (
    p_booking_id,
    'first_hour',
    v_booking.hourly_rate_cents_snapshot,
    v_fee_cents,
    'usd',
    'created',
    v_key,
    v_connected_account,
    p_authorization_version,
    v_now
  )
  on conflict (booking_id, kind) do nothing;

  if found then
    insert into public.booking_audit_events (
      booking_id, actor_user_id, actor_kind, action, from_status, to_status, metadata
    )
    values (
      p_booking_id, v_actor, 'customer', 'first_hour_payment_initiated',
      v_booking.status, v_booking.status,
      jsonb_build_object(
        'amount_cents', v_booking.hourly_rate_cents_snapshot,
        'application_fee_cents', v_fee_cents,
        'authorization_version', p_authorization_version
      )
    );
  end if;

  select bp.* into v_payment
  from public.booking_payments bp
  where bp.booking_id = p_booking_id and bp.kind = 'first_hour';

  return query
  select
    v_payment.id,
    v_payment.idempotency_key,
    v_payment.amount_cents,
    v_payment.application_fee_cents;
end;
$$;

-- ---------------------------------------------------------------------------
-- attach_first_hour_payment_intent — record Stripe ids after PI creation
-- ---------------------------------------------------------------------------
-- Called by the confirm action (authenticated, booking owner) once the Stripe
-- Customer + PaymentIntent exist. Writes ids only when unset, so a retry that
-- reuses the same idempotent PI is a no-op.

create function public.attach_first_hour_payment_intent(
  p_booking_id uuid,
  p_stripe_payment_intent_id text,
  p_stripe_customer_id text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
begin
  if v_actor is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  update public.booking_payments bp
  set
    stripe_payment_intent_id = coalesce(bp.stripe_payment_intent_id, p_stripe_payment_intent_id),
    stripe_customer_id = coalesce(bp.stripe_customer_id, p_stripe_customer_id),
    updated_at = now()
  from public.bookings b
  where bp.booking_id = p_booking_id
    and bp.kind = 'first_hour'
    and b.id = bp.booking_id
    and b.customer_id = v_actor;
  if not found then
    raise exception 'PAYMENT_NOT_FOUND';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- settle_first_hour_payment — webhook source of truth (service role)
-- ---------------------------------------------------------------------------
-- Idempotent. Returns one of:
--   'booked'         first-hour success within the window -> accepted->booked
--   'already_booked' duplicate/out-of-order success after the booking is booked
--   'refund_owed'    success arrived after the deadline or a terminal state
--   'already_settled_refund' late success already recorded (dedupe refund)
--   'not_found'      no first-hour payment matches this PaymentIntent

create function public.settle_first_hour_payment(
  p_stripe_payment_intent_id text,
  p_stripe_payment_method_id text default null,
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
    and bp.kind = 'first_hour';
  if not found then
    return 'not_found';
  end if;

  select b.* into v_booking
  from public.bookings b
  where b.id = v_payment.booking_id
  for update of b;

  if v_booking.status = 'booked' and v_payment.status = 'succeeded' then
    return 'already_booked';
  end if;

  -- On time and still reserved: capture the payment and reserve the job.
  if v_booking.status = 'accepted'
    and v_booking.initial_payment_due_at is not null
    and v_succeeded_at <= v_booking.initial_payment_due_at then

    update public.booking_payments
    set
      status = 'succeeded',
      stripe_payment_method_id = coalesce(p_stripe_payment_method_id, stripe_payment_method_id),
      succeeded_at = v_succeeded_at,
      updated_at = now()
    where id = v_payment.id;

    perform set_config('college_crew.trusted_booking_operation', 'on', true);
    update public.bookings
    set status = 'booked', stripe_payment_intent_id = p_stripe_payment_intent_id
    where id = v_booking.id and status = 'accepted';

    insert into public.booking_audit_events (
      booking_id, actor_user_id, actor_kind, action, from_status, to_status, metadata
    )
    values (
      v_booking.id, null, 'stripe', 'first_hour_payment_succeeded', 'accepted', 'booked',
      jsonb_build_object(
        'payment_id', v_payment.id,
        'stripe_payment_intent_id', p_stripe_payment_intent_id,
        'succeeded_at', v_succeeded_at
      )
    );
    return 'booked';
  end if;

  -- Late or terminal: record the (real) success but never revive the booking.
  if v_payment.status <> 'succeeded' then
    update public.booking_payments
    set
      status = 'succeeded',
      stripe_payment_method_id = coalesce(p_stripe_payment_method_id, stripe_payment_method_id),
      succeeded_at = v_succeeded_at,
      updated_at = now()
    where id = v_payment.id;

    insert into public.booking_audit_events (
      booking_id, actor_user_id, actor_kind, action, from_status, to_status, metadata
    )
    values (
      v_booking.id, null, 'stripe', 'first_hour_payment_succeeded_late', v_booking.status, null,
      jsonb_build_object(
        'payment_id', v_payment.id,
        'stripe_payment_intent_id', p_stripe_payment_intent_id,
        'booking_status', v_booking.status
      )
    );
  end if;

  if exists (
    select 1 from public.booking_refunds r where r.payment_id = v_payment.id
  ) then
    return 'already_settled_refund';
  end if;
  return 'refund_owed';
end;
$$;

-- ---------------------------------------------------------------------------
-- mark_first_hour_payment_unsuccessful — failure / cancellation (service role)
-- ---------------------------------------------------------------------------
-- Records the failure on the payment row without touching the booking, which
-- keeps its accepted reservation until the deadline so the customer can retry.

create function public.mark_first_hour_payment_unsuccessful(
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
    and bp.kind = 'first_hour';
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

  insert into public.booking_audit_events (
    booking_id, actor_user_id, actor_kind, action, from_status, to_status, metadata
  )
  values (
    v_payment.booking_id, null, 'stripe', 'first_hour_payment_' || p_target_status::text, null, null,
    jsonb_build_object(
      'payment_id', v_payment.id,
      'stripe_payment_intent_id', p_stripe_payment_intent_id,
      'failure_code', p_failure_code
    )
  );
  return p_target_status::text;
end;
$$;

-- ---------------------------------------------------------------------------
-- record_first_hour_refund — persist an executed Stripe refund (service role)
-- ---------------------------------------------------------------------------
-- Idempotent on the deterministic refund key. The caller performs the Stripe
-- refund (reverse_transfer + refund_application_fee) first, then records it.

create function public.record_first_hour_refund(
  p_stripe_payment_intent_id text,
  p_reason text,
  p_stripe_refund_id text default null,
  p_amount_cents integer default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment public.booking_payments%rowtype;
  v_key text;
  v_amount integer;
begin
  select bp.* into v_payment
  from public.booking_payments bp
  where bp.stripe_payment_intent_id = p_stripe_payment_intent_id
    and bp.kind = 'first_hour';
  if not found then
    return 'not_found';
  end if;

  v_key := 'fhr_' || v_payment.booking_id::text;
  v_amount := coalesce(p_amount_cents, v_payment.amount_cents);

  insert into public.booking_refunds (
    booking_id, payment_id, amount_cents, reason, status, idempotency_key,
    stripe_refund_id, reverse_transfer, refund_application_fee, succeeded_at
  )
  values (
    v_payment.booking_id, v_payment.id, v_amount, coalesce(nullif(btrim(p_reason), ''), 'late_success_after_deadline'),
    (case when coalesce(btrim(p_stripe_refund_id), '') <> '' then 'succeeded' else 'created' end)::public.booking_refund_status,
    v_key, p_stripe_refund_id, true, true,
    case when coalesce(btrim(p_stripe_refund_id), '') <> '' then now() else null end
  )
  on conflict (idempotency_key) do nothing;

  if not found then
    return 'already_recorded';
  end if;

  if coalesce(btrim(p_stripe_refund_id), '') <> '' then
    update public.booking_payments set status = 'refunded', updated_at = now()
    where id = v_payment.id;
  end if;

  insert into public.booking_audit_events (
    booking_id, actor_user_id, actor_kind, action, from_status, to_status, metadata
  )
  values (
    v_payment.booking_id, null, 'stripe', 'first_hour_refunded', null, null,
    jsonb_build_object(
      'payment_id', v_payment.id,
      'amount_cents', v_amount,
      'stripe_refund_id', p_stripe_refund_id,
      'reason', p_reason
    )
  );
  return 'recorded';
end;
$$;

-- ---------------------------------------------------------------------------
-- expire_unpaid_acceptance — release an unpaid acceptance past its deadline
-- ---------------------------------------------------------------------------
-- Idempotent recovery op. Dashboards call it synchronously for past-due unpaid
-- acceptances; Phase 7 schedules it. Participants (or the service role) only.

create function public.expire_unpaid_acceptance(p_booking_id uuid)
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
  select b.* into v_booking
  from public.bookings b
  where b.id = p_booking_id
  for update of b;
  if not found then
    raise exception 'BOOKING_NOT_FOUND';
  end if;

  -- Authenticated callers must be a participant; the service role is unrestricted.
  if v_actor is not null
    and v_booking.customer_id <> v_actor
    and not public.owns_provider_profile(v_booking.provider_id) then
    raise exception 'NOT_AUTHORIZED';
  end if;

  if v_booking.booking_flow <> 'hourly_v1' or v_booking.status <> 'accepted' then
    return v_booking.status::text;
  end if;
  if v_booking.initial_payment_due_at is null or v_now < v_booking.initial_payment_due_at then
    return v_booking.status::text;
  end if;
  if exists (
    select 1 from public.booking_payments bp
    where bp.booking_id = p_booking_id and bp.kind = 'first_hour' and bp.status = 'succeeded'
  ) then
    return v_booking.status::text;
  end if;

  perform set_config('college_crew.trusted_booking_operation', 'on', true);
  update public.bookings
  set status = 'expired', expired_at = v_now
  where id = p_booking_id and status = 'accepted';

  insert into public.booking_audit_events (
    booking_id, actor_user_id, actor_kind, action, from_status, to_status, metadata
  )
  values (
    p_booking_id, v_actor, case when v_actor is null then 'system' else 'customer' end,
    'acceptance_expired_unpaid', 'accepted', 'expired',
    jsonb_build_object('initial_payment_due_at', v_booking.initial_payment_due_at)
  );
  return 'expired';
end;
$$;

-- ---------------------------------------------------------------------------
-- Least-privilege execute grants (SECURITY DEFINER routines default to PUBLIC)
-- ---------------------------------------------------------------------------

revoke execute on function public.begin_first_hour_payment(uuid, text)
  from public, anon;
grant execute on function public.begin_first_hour_payment(uuid, text)
  to authenticated;

revoke execute on function public.attach_first_hour_payment_intent(uuid, text, text)
  from public, anon;
grant execute on function public.attach_first_hour_payment_intent(uuid, text, text)
  to authenticated;

revoke execute on function public.expire_unpaid_acceptance(uuid)
  from public, anon;
grant execute on function public.expire_unpaid_acceptance(uuid)
  to authenticated, service_role;

revoke execute on function public.settle_first_hour_payment(text, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.settle_first_hour_payment(text, text, timestamptz)
  to service_role;

revoke execute on function public.mark_first_hour_payment_unsuccessful(
  text, public.booking_payment_status, text, text
) from public, anon, authenticated;
grant execute on function public.mark_first_hour_payment_unsuccessful(
  text, public.booking_payment_status, text, text
) to service_role;

revoke execute on function public.record_first_hour_refund(text, text, text, integer)
  from public, anon, authenticated;
grant execute on function public.record_first_hour_refund(text, text, text, integer)
  to service_role;
