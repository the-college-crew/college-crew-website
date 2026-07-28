-- Held-funds charge model + payout on completion.
--
-- Until now every charge was a Stripe DESTINATION charge, so capturing the first
-- hour immediately moved 95% to the student's connected account. That forces a
-- transfer reversal whenever the platform later needs more of that hour (a job
-- settled in cash) and makes cancellations messy.
--
-- New model: capture into the PLATFORM balance and pay the student ONCE, after
-- the job. The rake comes entirely out of the retained first hour; the balance
-- charge passes through in full.
--
--   normal    collected = first hour + balance   payout = collected - rake
--   cash      collected = first hour             payout = collected - rake
--   cancelled collected = first hour (refunded)  payout = none, nothing to reverse
--
-- Existing rows are stamped 'destination' so in-flight bookings keep refunding
-- with reverse_transfer; only new rows use the held model.

-- 1) Which model funded a given payment row.
do $$
begin
  if not exists (select 1 from pg_type where typname = 'booking_charge_model') then
    create type public.booking_charge_model as enum ('destination', 'platform');
  end if;
end$$;

alter table public.booking_payments
  add column if not exists charge_model public.booking_charge_model
    not null default 'platform';

-- Everything that already exists predates the cutover.
update public.booking_payments
set charge_model = 'destination'
where created_at < now() and charge_model = 'platform';

-- 2) One payout record per transfer, for idempotency and audit.
create table if not exists public.booking_provider_payouts (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id) on delete restrict,
  payment_id uuid references public.booking_payments (id) on delete restrict,
  amount_cents integer not null check (amount_cents >= 0),
  status text not null default 'pending'
    check (status in ('pending', 'paid', 'failed')),
  idempotency_key text not null unique,
  stripe_transfer_id text unique,
  stripe_destination_account_id text not null,
  stripe_source_charge_id text,
  last_error text,
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists booking_provider_payouts_booking_idx
  on public.booking_provider_payouts (booking_id);

-- Server-only, like booking_payments: reachable solely through SECURITY DEFINER
-- RPCs and the service role. No public policies.
alter table public.booking_provider_payouts enable row level security;
revoke all on table public.booking_provider_payouts from anon, authenticated;

-- 3) Allow the payout job kind.
alter table public.booking_automation_jobs
  drop constraint if exists booking_automation_jobs_kind_valid;
alter table public.booking_automation_jobs
  add constraint booking_automation_jobs_kind_valid
  check (kind = any (array[
    'response_alert', 'request_expiration', 'payment_expiration',
    'invoice_autocharge', 'completion_timeout', 'provider_payout'
  ]));

-- 4) What the scheduler needs to pay a completed job: how much was actually
--    collected, what the rake is, and which charges funded it. Returns one row
--    per funding charge so each transfer can cite its own source_transaction.
--    Only settles hourly bookings that reached 'completed' on the NEW model.
create or replace function public.provider_payout_plan(p_booking_id uuid)
 returns table (
   payment_id uuid,
   kind public.booking_payment_kind,
   stripe_payment_intent_id text,
   destination_account_id text,
   payout_amount_cents integer
 )
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_booking public.bookings%rowtype;
  v_rake integer;
begin
  select b.* into v_booking
  from public.bookings b
  where b.id = p_booking_id and b.booking_flow = 'hourly_v1';
  if not found then
    raise exception 'BOOKING_NOT_FOUND';
  end if;

  -- The rake is 5% of the job's actual value (the invoice subtotal). With no
  -- invoice yet there is nothing to pay out.
  select bi.total_platform_fee_cents into v_rake
  from public.booking_invoices bi
  where bi.booking_id = p_booking_id;
  if v_rake is null then
    return;
  end if;

  return query
  with funding as (
    select
      bp.id,
      bp.kind,
      bp.stripe_payment_intent_id,
      bp.stripe_connected_account_id,
      bp.amount_cents,
      -- The whole rake is withheld from the first hour; the balance passes
      -- through untouched. Never negative.
      case when bp.kind = 'first_hour'
        then greatest(0, bp.amount_cents - v_rake)
        else bp.amount_cents
      end as payout_cents
    from public.booking_payments bp
    where bp.booking_id = p_booking_id
      and bp.status = 'succeeded'
      and bp.charge_model = 'platform'
      and bp.stripe_payment_intent_id is not null
  )
  select f.id, f.kind, f.stripe_payment_intent_id,
         f.stripe_connected_account_id, f.payout_cents::integer
  from funding f
  where f.payout_cents > 0;
end;
$function$;

revoke all on function public.provider_payout_plan(uuid) from public, anon, authenticated;
grant execute on function public.provider_payout_plan(uuid) to service_role;

-- 5) Record a payout attempt / its result. Idempotent on the key.
create or replace function public.record_provider_payout(
  p_booking_id uuid,
  p_payment_id uuid,
  p_idempotency_key text,
  p_amount_cents integer,
  p_destination_account_id text,
  p_source_charge_id text,
  p_stripe_transfer_id text default null,
  p_status text default 'pending',
  p_error text default null
)
 returns uuid
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_id uuid;
begin
  insert into public.booking_provider_payouts (
    booking_id, payment_id, amount_cents, status, idempotency_key,
    stripe_transfer_id, stripe_destination_account_id, stripe_source_charge_id,
    last_error, paid_at
  ) values (
    p_booking_id, p_payment_id, p_amount_cents, p_status, p_idempotency_key,
    p_stripe_transfer_id, p_destination_account_id, p_source_charge_id,
    p_error, case when p_status = 'paid' then now() else null end
  )
  on conflict (idempotency_key) do update
    set status = excluded.status,
        stripe_transfer_id = coalesce(excluded.stripe_transfer_id,
                                      public.booking_provider_payouts.stripe_transfer_id),
        stripe_source_charge_id = coalesce(excluded.stripe_source_charge_id,
                                           public.booking_provider_payouts.stripe_source_charge_id),
        last_error = excluded.last_error,
        paid_at = coalesce(public.booking_provider_payouts.paid_at, excluded.paid_at),
        updated_at = now()
  returning id into v_id;
  return v_id;
end;
$function$;

revoke all on function public.record_provider_payout(uuid, uuid, text, integer, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.record_provider_payout(uuid, uuid, text, integer, text, text, text, text, text)
  to service_role;

-- 6) Enqueue the payout when a booking completes. Separate trigger so the large
--    lifecycle trigger stays untouched; the job queue dedupes on event_key, so a
--    re-entry can never pay twice.
--
--    The function is defined here but DELIBERATELY NOT ATTACHED. The live
--    scheduler is the Supabase Edge Function, and it only learns the
--    'provider_payout' kind when it is redeployed. Attaching the trigger before
--    that would mint jobs the running scheduler rejects as UnknownAutomationKind,
--    burning retries and firing founder alerts. The companion migration
--    20260724120100 attaches it, and is applied at deploy time.
create or replace function private.queue_provider_payout()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.status = 'completed'
    and old.status is distinct from 'completed'
    and new.booking_flow = 'hourly_v1' then
    perform private.enqueue_booking_automation_job(
      'provider_payout_' || new.id::text,
      'provider_payout',
      new.id,
      new.id,
      statement_timestamp()
    );
  end if;
  return new;
end;
$function$;
