-- Remove in-app invoice tips and restore the original balance-only payment flow.
--
-- The introducing migration has already been applied to the shared project, so
-- this is intentionally a forward rollback. Refuse to discard financial data
-- if a tip is recorded between review and deployment.

begin;

lock table public.booking_invoices in access exclusive mode;

do $$
begin
  if exists (
    select 1
    from public.booking_invoices
    where tip_cents <> 0
  ) then
    raise exception 'CANNOT_REMOVE_RECORDED_INVOICE_TIPS';
  end if;
end;
$$;

drop trigger if exists booking_invoice_clear_uncharged_tip
  on public.booking_invoices;
drop function if exists private.clear_uncharged_invoice_tip();

drop function if exists public.begin_balance_payment(uuid, integer);
drop function if exists public.reset_balance_payment_for_retry(uuid, integer);

create or replace function public.begin_balance_payment(p_invoice_id uuid)
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
  if v_invoice.remaining_balance_cents <= 0 then raise exception 'NO_BALANCE_DUE'; end if;
  if exists (select 1 from public.booking_disputes d
             where d.booking_id = v_booking.id) then
    raise exception 'DISPUTE_OPEN';
  end if;
  select bp.* into v_upfront from public.booking_payments bp
  where bp.booking_id = v_booking.id
    and bp.kind in ('first_hour', 'quote_deposit');
  if not found then raise exception 'UPFRONT_PAYMENT_MISSING'; end if;

  v_remaining_fee := greatest(
    0, v_invoice.total_platform_fee_cents - v_upfront.application_fee_cents
  );
  insert into public.booking_payments (
    booking_id, invoice_id, kind, amount_cents, application_fee_cents, currency,
    status, idempotency_key, stripe_connected_account_id,
    customer_authorization_version, authorized_at
  ) values (
    v_booking.id, v_invoice.id, 'balance', v_invoice.remaining_balance_cents,
    v_remaining_fee, 'usd', 'created', 'bal_' || v_booking.id::text || '_0',
    v_upfront.stripe_connected_account_id,
    v_upfront.customer_authorization_version, v_now
  ) on conflict (booking_id, kind) do nothing;
  select bp.* into v_payment from public.booking_payments bp
  where bp.booking_id = v_booking.id and bp.kind = 'balance';
  return query select v_payment.id, v_payment.idempotency_key,
    v_payment.amount_cents, v_payment.application_fee_cents;
end;
$$;
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
begin
  select bi.* into v_invoice from public.booking_invoices bi
  where bi.id = p_invoice_id for update;
  if not found or v_invoice.status <> 'review'
    or v_invoice.remaining_balance_cents <= 0
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
  insert into public.booking_payments (
    booking_id, invoice_id, kind, amount_cents, application_fee_cents, currency,
    status, idempotency_key, stripe_connected_account_id,
    customer_authorization_version, authorized_at
  ) values (
    v_booking.id, v_invoice.id, 'balance', v_invoice.remaining_balance_cents,
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

revoke all on function public.begin_balance_payment(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.begin_balance_payment(uuid) to authenticated;

revoke all on function public.reset_balance_payment_for_retry(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.reset_balance_payment_for_retry(uuid)
  to authenticated;

revoke all on function public.settle_zero_balance_invoice(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.settle_zero_balance_invoice(uuid)
  to authenticated, service_role;

revoke all on function public.claim_due_invoice(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.claim_due_invoice(uuid) to service_role;

alter table public.booking_invoices
  drop column tip_cents;

commit;
