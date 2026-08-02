-- ---------------------------------------------------------------------------
-- Optional customer tip on the post-job invoice — 100% to the student
-- ---------------------------------------------------------------------------
-- The customer may add an optional tip when paying the invoice (both hourly_v1
-- and quote_v2 settle through this same balance charge). The student receives
-- the entire tip: no platform fee is taken on it.
--
-- Why the tip is its own column and NOT part of subtotal_cents:
-- booking_invoices is fully CHECK-derived —
--   total_platform_fee_cents = ((subtotal_cents * platform_fee_bps_snapshot + 5000) / 10000)
--   remaining_balance_cents  = greatest(0, subtotal_cents - first_hour_credit_cents)
-- Folding a tip into the subtotal would both break those constraints and rake
-- 5% off the tip. Keeping it outside leaves every existing constraint intact
-- and keeps `application_fee_cents` on the balance payment untouched, which is
-- what makes "100% to the student" true mechanically rather than only in copy.
--
-- Payout needs no change: provider_payout_plan withholds the whole rake from
-- the upfront leg and transfers the `balance` leg 1:1, so a tip carried inside
-- the balance charge reaches the student in full and inherits the 3-day payout
-- delay and the dispute hold for free.
--
-- A job of one hour or less has remaining_balance_cents = 0 and today settles
-- with no Stripe call. That is exactly the job someone wants to tip, so the
-- charge path now keys off (balance + tip) rather than the balance alone, and
-- settle_zero_balance_invoice refuses to swallow a tip.

alter table public.booking_invoices
  add column if not exists tip_cents integer not null default 0;

alter table public.booking_invoices
  drop constraint if exists booking_invoices_tip_valid;
alter table public.booking_invoices
  add constraint booking_invoices_tip_valid
  check (tip_cents between 0 and 50000);

comment on column public.booking_invoices.tip_cents is
  'Optional customer tip in cents, charged with the balance and paid to the provider in full (never included in subtotal_cents, so it is never raked).';

-- ---------------------------------------------------------------------------
-- Discard an uncharged tip when a dispute resolution rewrites the billing
-- ---------------------------------------------------------------------------
-- resolve_booking_dispute rewrites an unpaid invoice's remaining balance (a
-- minutes reduction) or waives it outright, and in both cases the balance
-- payment amount is rewritten from the reduced balance alone. Zeroing the tip
-- there keeps the invoice and the payment row in agreement, so we never show a
-- tip line for money that was never collected. An already-paid invoice is left
-- alone: a partial dispute refund leaves the tip with the student, and a full
-- refund returns it because the refund covers the payment's whole amount.

create or replace function private.clear_uncharged_invoice_tip()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.tip_cents > 0
    and old.status in ('review', 'requires_action', 'processing')
    and (
      new.status = 'waived'
      or new.remaining_balance_cents <> old.remaining_balance_cents
    )
  then
    new.tip_cents := 0;
  end if;
  return new;
end;
$$;

drop trigger if exists booking_invoice_clear_uncharged_tip on public.booking_invoices;
create trigger booking_invoice_clear_uncharged_tip
  before update on public.booking_invoices
  for each row
  execute function private.clear_uncharged_invoice_tip();

-- ---------------------------------------------------------------------------
-- begin_balance_payment — now charges balance + tip
-- ---------------------------------------------------------------------------
-- p_tip_cents null means "leave whatever tip is already recorded alone", so the
-- existing single-argument callers (the mobile edge functions) keep working
-- unchanged. A defaulted second parameter makes a one-argument call ambiguous
-- against the old signature, so the old one is dropped and the grants replayed.

drop function if exists public.begin_balance_payment(uuid);

create function public.begin_balance_payment(
  p_invoice_id uuid,
  p_tip_cents integer default null
)
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
  v_upfront public.booking_payments%rowtype;
  v_remaining_fee integer;
  v_payment public.booking_payments%rowtype;
  v_tip integer;
  v_amount integer;
  v_next smallint;
  v_key text;
begin
  select bi.* into v_invoice from public.booking_invoices bi
  where bi.id = p_invoice_id;
  if not found then raise exception 'INVOICE_NOT_FOUND'; end if;
  select b.* into v_booking from public.bookings b
  where b.id = v_invoice.booking_id and b.customer_id = v_actor for update;
  if not found then raise exception 'BOOKING_NOT_FOUND'; end if;
  if v_booking.status <> 'invoice_review' then
    raise exception 'BOOKING_NOT_IN_REVIEW:%', v_booking.status;
  end if;
  if v_invoice.status not in ('review', 'requires_action') then
    raise exception 'INVOICE_NOT_PAYABLE:%', v_invoice.status;
  end if;
  if exists (select 1 from public.booking_disputes d
             where d.booking_id = v_booking.id) then
    raise exception 'DISPUTE_OPEN';
  end if;

  -- Clamped rather than rejected: the tip is a convenience, not a gate.
  v_tip := case
    when p_tip_cents is null then v_invoice.tip_cents
    else least(greatest(p_tip_cents, 0), 50000)
  end;
  v_amount := v_invoice.remaining_balance_cents + v_tip;
  if v_amount <= 0 then raise exception 'NOTHING_TO_CHARGE'; end if;
  if v_tip <> v_invoice.tip_cents then
    update public.booking_invoices
    set tip_cents = v_tip, updated_at = now()
    where id = v_invoice.id;
  end if;

  select bp.* into v_upfront from public.booking_payments bp
  where bp.booking_id = v_booking.id
    and bp.kind in ('first_hour', 'quote_deposit');
  if not found then raise exception 'UPFRONT_PAYMENT_MISSING'; end if;

  -- The fee is still derived from the invoice subtotal only, so the tip is
  -- never raked; it rides along in amount_cents and transfers out in full.
  v_remaining_fee := greatest(
    0, v_invoice.total_platform_fee_cents - v_upfront.application_fee_cents
  );
  insert into public.booking_payments (
    booking_id, invoice_id, kind, amount_cents, application_fee_cents, currency,
    status, idempotency_key, stripe_connected_account_id,
    customer_authorization_version, authorized_at
  ) values (
    v_booking.id, v_invoice.id, 'balance', v_amount,
    v_remaining_fee, 'usd', 'created', 'bal_' || v_booking.id::text || '_0',
    v_upfront.stripe_connected_account_id,
    v_upfront.customer_authorization_version, v_now
  ) on conflict (booking_id, kind) do nothing;
  select bp.* into v_payment from public.booking_payments bp
  where bp.booking_id = v_booking.id and bp.kind = 'balance'
  for update;

  -- Changing the tip changes the amount, so the attempt must get a fresh
  -- idempotency key: reusing the old one would replay the earlier amount at
  -- Stripe. Money already in flight is never re-priced.
  if v_payment.status not in ('succeeded', 'processing')
    and v_payment.amount_cents <> v_amount then
    v_next := (v_payment.attempt_count + 1)::smallint;
    v_key := 'bal_' || v_booking.id::text || '_' || v_next::text;
    update public.booking_payments
    set amount_cents = v_amount,
        application_fee_cents = v_remaining_fee,
        attempt_count = v_next,
        idempotency_key = v_key,
        status = 'created',
        stripe_payment_intent_id = null,
        failure_code = null,
        failure_message = null,
        action_required_reason = null,
        updated_at = now()
    where id = v_payment.id
    returning * into v_payment;
  end if;

  return query select v_payment.id, v_payment.idempotency_key,
    v_payment.amount_cents, v_payment.application_fee_cents;
end;
$$;

revoke all on function public.begin_balance_payment(uuid, integer) from public;
grant execute on function public.begin_balance_payment(uuid, integer)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- reset_balance_payment_for_retry — re-price the retry off balance + tip
-- ---------------------------------------------------------------------------

drop function if exists public.reset_balance_payment_for_retry(uuid);

create function public.reset_balance_payment_for_retry(
  p_invoice_id uuid,
  p_tip_cents integer default null
)
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
  v_invoice public.booking_invoices%rowtype;
  v_payment public.booking_payments%rowtype;
  v_next smallint;
  v_key text;
  v_tip integer;
  v_amount integer;
begin
  if v_actor is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  select bi.* into v_invoice from public.booking_invoices bi
  where bi.id = p_invoice_id;
  if not found then
    raise exception 'INVOICE_NOT_FOUND';
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

  v_tip := case
    when p_tip_cents is null then v_invoice.tip_cents
    else least(greatest(p_tip_cents, 0), 50000)
  end;
  v_amount := v_invoice.remaining_balance_cents + v_tip;
  if v_amount <= 0 then raise exception 'NOTHING_TO_CHARGE'; end if;
  if v_tip <> v_invoice.tip_cents then
    update public.booking_invoices
    set tip_cents = v_tip, updated_at = now()
    where id = v_invoice.id;
  end if;

  v_next := (v_payment.attempt_count + 1)::smallint;
  v_key := 'bal_' || v_payment.booking_id::text || '_' || v_next::text;

  update public.booking_payments
  set
    amount_cents = v_amount,
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
    jsonb_build_object(
      'invoice_id', p_invoice_id, 'attempt_count', v_next, 'tip_cents', v_tip
    )
  );

  return query
  select v_key, v_amount, v_payment.application_fee_cents;
end;
$$;

revoke all on function public.reset_balance_payment_for_retry(uuid, integer) from public;
grant execute on function public.reset_balance_payment_for_retry(uuid, integer)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- settle_zero_balance_invoice — must not swallow a tip
-- ---------------------------------------------------------------------------

create or replace function public.settle_zero_balance_invoice(p_invoice_id uuid)
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

  if v_actor is not null and v_booking.customer_id <> v_actor then
    raise exception 'NOT_AUTHORIZED';
  end if;
  if v_invoice.remaining_balance_cents <> 0 then
    raise exception 'BALANCE_DUE';
  end if;
  -- A tipped short job is a real charge; it must go through the payment path.
  if v_invoice.tip_cents > 0 then
    raise exception 'TIP_DUE';
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
-- claim_due_invoice — the 24h autocharge bills balance + any recorded tip
-- ---------------------------------------------------------------------------
-- A tip is only ever recorded when the customer submits the pay form, so an
-- untouched invoice autocharges the balance alone. If they submitted with a tip
-- and the card then failed, this re-attempts the amount they authorized.

create or replace function public.claim_due_invoice(p_invoice_id uuid)
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
  v_upfront public.booking_payments%rowtype;
  v_payment public.booking_payments%rowtype;
  v_remaining_fee integer;
  v_amount integer;
begin
  select bi.* into v_invoice from public.booking_invoices bi
  where bi.id = p_invoice_id for update;
  if not found or v_invoice.status <> 'review'
    or v_invoice.remaining_balance_cents + v_invoice.tip_cents <= 0
    or v_invoice.autocharge_at is null or v_now < v_invoice.autocharge_at then
    return;
  end if;
  select b.* into v_booking from public.bookings b
  where b.id = v_invoice.booking_id for update;
  if v_booking.status <> 'invoice_review'
    or exists (select 1 from public.booking_disputes d
               where d.booking_id = v_booking.id) then return; end if;
  select bp.* into v_upfront from public.booking_payments bp
  where bp.booking_id = v_booking.id
    and bp.kind in ('first_hour', 'quote_deposit');
  if not found then return; end if;
  v_remaining_fee := greatest(
    0, v_invoice.total_platform_fee_cents - v_upfront.application_fee_cents
  );
  v_amount := v_invoice.remaining_balance_cents + v_invoice.tip_cents;
  insert into public.booking_payments (
    booking_id, invoice_id, kind, amount_cents, application_fee_cents, currency,
    status, idempotency_key, stripe_connected_account_id,
    customer_authorization_version, authorized_at
  ) values (
    v_booking.id, v_invoice.id, 'balance', v_amount,
    v_remaining_fee, 'usd', 'created', 'bal_' || v_booking.id::text || '_0',
    v_upfront.stripe_connected_account_id,
    v_upfront.customer_authorization_version, v_now
  ) on conflict (booking_id, kind) do nothing;
  select bp.* into v_payment from public.booking_payments bp
  where bp.booking_id = v_booking.id and bp.kind = 'balance';
  if v_payment.status in ('succeeded', 'processing') then return; end if;
  update public.booking_invoices set status = 'processing', updated_at = now()
  where id = v_invoice.id;
  return query select v_payment.id, v_booking.id, v_payment.idempotency_key,
    v_payment.amount_cents, v_payment.application_fee_cents,
    v_upfront.stripe_customer_id, v_upfront.stripe_payment_method_id,
    v_upfront.stripe_connected_account_id;
end;
$$;
