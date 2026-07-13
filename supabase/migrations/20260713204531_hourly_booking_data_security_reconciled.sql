-- Hourly Booking v1, Phase 1: additive data, policy, and security foundation.
--
-- Timestamped after the already-applied per-booking conversations migration.
--
-- This migration deliberately preserves the legacy booking/pricing flow while
-- the hourly flow is disabled. Existing fixed/quote values are not converted,
-- and the legacy `paid` booking status remains valid until the rollout phase.

set lock_timeout = '10s';
set statement_timeout = '2min';

-- ---------------------------------------------------------------------------
-- Shared enums
-- ---------------------------------------------------------------------------

-- Keep `paid` for existing bookings. The hourly flow uses `booked` after the
-- first-hour payment succeeds and stores payment failure on payment records.
alter type public.booking_status add value if not exists 'booked' after 'accepted';
alter type public.booking_status add value if not exists 'in_progress' after 'booked';
alter type public.booking_status add value if not exists 'invoice_review' after 'in_progress';
alter type public.booking_status add value if not exists 'disputed' after 'invoice_review';
alter type public.booking_status add value if not exists 'withdrawn' after 'declined';
alter type public.booking_status add value if not exists 'expired' after 'withdrawn';

create type public.booking_flow as enum ('legacy', 'hourly_v1');
create type public.booking_payment_kind as enum ('first_hour', 'balance');
create type public.booking_payment_status as enum (
  'created',
  'requires_action',
  'processing',
  'succeeded',
  'failed',
  'cancelled',
  'refunded'
);
create type public.booking_refund_status as enum (
  'created',
  'processing',
  'succeeded',
  'failed',
  'cancelled'
);
create type public.booking_invoice_status as enum (
  'draft',
  'review',
  'requires_action',
  'processing',
  'paid',
  'waived',
  'refunded'
);
create type public.booking_dispute_status as enum ('open', 'resolved');
create type public.booking_dispute_category as enum (
  'provider_no_show',
  'hours',
  'service',
  'payment',
  'cancellation',
  'other'
);
create type public.booking_dispute_resolution as enum (
  'approve_submitted_hours',
  'reduce_billable_minutes',
  'waive_remaining_balance',
  'cancel_and_refund'
);
create type public.email_outbox_status as enum (
  'pending',
  'processing',
  'sent',
  'failed'
);

-- ---------------------------------------------------------------------------
-- Provider availability, payout readiness, and hourly offerings
-- ---------------------------------------------------------------------------

alter table public.provider_profiles
  add column availability_weekdays smallint[] not null default '{}'::smallint[],
  add column availability_start_local time,
  add column availability_end_local time,
  add column availability_note text not null default '',
  add column service_zip text,
  add column minimum_notice_hours smallint not null default 24,
  add column stripe_transfers_active boolean not null default false,
  add column stripe_transfers_checked_at timestamptz,
  add constraint provider_profiles_availability_weekdays_valid check (
    availability_weekdays <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[]
    and cardinality(availability_weekdays) <= 7
    and cardinality(array_positions(availability_weekdays, 0::smallint)) <= 1
    and cardinality(array_positions(availability_weekdays, 1::smallint)) <= 1
    and cardinality(array_positions(availability_weekdays, 2::smallint)) <= 1
    and cardinality(array_positions(availability_weekdays, 3::smallint)) <= 1
    and cardinality(array_positions(availability_weekdays, 4::smallint)) <= 1
    and cardinality(array_positions(availability_weekdays, 5::smallint)) <= 1
    and cardinality(array_positions(availability_weekdays, 6::smallint)) <= 1
  ),
  add constraint provider_profiles_availability_window_valid check (
    (availability_start_local is null and availability_end_local is null)
    or (
      availability_start_local is not null
      and availability_end_local is not null
      and availability_start_local < availability_end_local
    )
  ),
  add constraint provider_profiles_availability_note_length check (
    char_length(availability_note) <= 1000
  ),
  add constraint provider_profiles_service_zip_valid check (
    service_zip is null or service_zip ~ '^[0-9]{5}$'
  ),
  add constraint provider_profiles_minimum_notice_hours_valid check (
    minimum_notice_hours between 3 and 168
  ),
  add constraint provider_profiles_transfers_check_consistent check (
    not stripe_transfers_active or stripe_transfers_checked_at is not null
  );

comment on column public.provider_profiles.service_zip is
  'Private service-area ZIP. Never expose through public directory shapes.';
comment on column public.provider_profiles.availability_weekdays is
  'Unique ISO-style weekdays encoded Monday=0 through Sunday=6 in America/Chicago.';
comment on column public.provider_profiles.stripe_transfers_active is
  'Server-maintained snapshot of the Accounts v2 recipient stripe_transfers capability.';

alter table public.provider_services
  add column hourly_rate_cents integer,
  add constraint provider_services_hourly_rate_valid check (
    hourly_rate_cents is null or hourly_rate_cents between 2000 and 15000
  );

create index provider_profiles_hourly_eligible_zip_idx
  on public.provider_profiles (service_zip, id)
  where verification_status = 'approved' and stripe_transfers_active;

create index provider_services_hourly_lookup_idx
  on public.provider_services (service_id, provider_id, hourly_rate_cents)
  where hourly_rate_cents is not null;

-- ---------------------------------------------------------------------------
-- Booking lifecycle and immutable hourly-policy snapshots
-- ---------------------------------------------------------------------------

alter table public.bookings
  add column booking_flow public.booking_flow not null default 'legacy',
  add column estimated_minutes smallint,
  add column job_zip text,
  add column hourly_rate_cents_snapshot integer,
  add column platform_fee_bps smallint,
  add column billing_minimum_minutes smallint,
  add column billing_increment_minutes smallint,
  add column cancellation_notice_hours smallint,
  add column pilot_timezone text not null default 'America/Chicago',
  add column response_window_hours smallint,
  add column response_alert_at timestamptz,
  add column accepted_at timestamptz,
  add column initial_payment_due_at timestamptz,
  add column arrived_at timestamptz,
  add column work_completed_at timestamptz,
  add column cancelled_at timestamptz,
  add column cancelled_by uuid references public.profiles (id) on delete set null,
  add column cancelled_by_role public.user_role,
  add column cancellation_reason text,
  add column cancellation_policy_result text,
  add column withdrawn_at timestamptz,
  add column withdrawn_by uuid references public.profiles (id) on delete set null,
  add column withdrawal_reason text,
  add column expired_at timestamptz,
  add column replacement_for_booking_id uuid references public.bookings (id) on delete restrict,
  add column replaced_by_booking_id uuid references public.bookings (id) on delete restrict,
  add column customer_name_snapshot text,
  add column provider_display_name_snapshot text,
  add column service_name_snapshot text,
  add column fee_policy_version text,
  add column cancellation_policy_version text,
  add column terms_version text,
  add column customer_authorization_version text,
  add column policy_snapshot jsonb,
  add column customer_authorization_snapshot jsonb,
  add constraint bookings_estimated_minutes_valid check (
    estimated_minutes is null
    or (estimated_minutes between 60 and 720 and estimated_minutes % 15 = 0)
  ),
  add constraint bookings_job_zip_valid check (
    job_zip is null or job_zip ~ '^[0-9]{5}$'
  ),
  add constraint bookings_hourly_rate_snapshot_valid check (
    hourly_rate_cents_snapshot is null
    or hourly_rate_cents_snapshot between 2000 and 15000
  ),
  add constraint bookings_platform_fee_bps_valid check (
    platform_fee_bps is null or platform_fee_bps between 0 and 10000
  ),
  add constraint bookings_response_window_valid check (
    response_window_hours is null
    or response_window_hours in (1, 3, 5, 12, 24, 48, 72)
  ),
  add constraint bookings_response_before_start check (
    response_alert_at is null or response_alert_at < scheduled_at
  ),
  add constraint bookings_response_deadline_valid check (
    (response_window_hours is null and response_alert_at is null)
    or (
      response_window_hours is not null
      and response_alert_at is not null
      and response_alert_at = created_at + response_window_hours * interval '1 hour'
    )
  ),
  add constraint bookings_initial_payment_before_start check (
    initial_payment_due_at is null or initial_payment_due_at <= scheduled_at
  ),
  add constraint bookings_initial_payment_deadline_valid check (
    (accepted_at is null and initial_payment_due_at is null)
    or (
      accepted_at is not null
      and initial_payment_due_at is not null
      and initial_payment_due_at = least(
        accepted_at + interval '12 hours',
        scheduled_at
      )
    )
  ),
  add constraint bookings_replacement_not_self check (
    (replacement_for_booking_id is null or replacement_for_booking_id <> id)
    and (replaced_by_booking_id is null or replaced_by_booking_id <> id)
  ),
  add constraint bookings_cancellation_result_valid check (
    cancellation_policy_result is null
    or cancellation_policy_result in (
      'full_refund',
      'no_refund',
      'no_payment',
      'manual_review'
    )
  ),
  add constraint bookings_policy_snapshots_are_objects check (
    (policy_snapshot is null or jsonb_typeof(policy_snapshot) = 'object')
    and (
      customer_authorization_snapshot is null
      or jsonb_typeof(customer_authorization_snapshot) = 'object'
    )
  ),
  add constraint bookings_hourly_contract_complete check (
    booking_flow = 'legacy'
    or (
      estimated_minutes is not null
      and job_zip is not null
      and hourly_rate_cents_snapshot is not null
      and platform_fee_bps = 500
      and billing_minimum_minutes = 60
      and billing_increment_minutes = 15
      and cancellation_notice_hours = 12
      and pilot_timezone = 'America/Chicago'
      and response_window_hours is not null
      and response_alert_at is not null
      and customer_name_snapshot is not null
      and btrim(customer_name_snapshot) <> ''
      and provider_display_name_snapshot is not null
      and btrim(provider_display_name_snapshot) <> ''
      and service_name_snapshot is not null
      and btrim(service_name_snapshot) <> ''
      and fee_policy_version is not null
      and btrim(fee_policy_version) <> ''
      and cancellation_policy_version is not null
      and btrim(cancellation_policy_version) <> ''
      and terms_version is not null
      and btrim(terms_version) <> ''
      and customer_authorization_version is not null
      and btrim(customer_authorization_version) <> ''
      and policy_snapshot is not null
      and customer_authorization_snapshot is not null
    )
  );

create unique index bookings_one_replacement_per_original_idx
  on public.bookings (replacement_for_booking_id)
  where replacement_for_booking_id is not null;
create index bookings_replaced_by_booking_id_idx
  on public.bookings (replaced_by_booking_id)
  where replaced_by_booking_id is not null;
create index bookings_cancelled_by_idx
  on public.bookings (cancelled_by)
  where cancelled_by is not null;
create index bookings_withdrawn_by_idx
  on public.bookings (withdrawn_by)
  where withdrawn_by is not null;
create index bookings_status_response_alert_idx
  on public.bookings (status, response_alert_at);
create index bookings_status_initial_payment_due_idx
  on public.bookings (status, initial_payment_due_at);

-- Snapshot columns are fixed at request creation. Lifecycle timestamps and
-- replacement links may be filled once, but never rewritten or cleared.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create function private.enforce_booking_immutability()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (
    new.booking_flow,
    new.customer_id,
    new.provider_id,
    new.service_id,
    new.estimated_minutes,
    new.job_zip,
    new.hourly_rate_cents_snapshot,
    new.platform_fee_bps,
    new.billing_minimum_minutes,
    new.billing_increment_minutes,
    new.cancellation_notice_hours,
    new.pilot_timezone,
    new.response_window_hours,
    new.response_alert_at,
    new.customer_name_snapshot,
    new.provider_display_name_snapshot,
    new.service_name_snapshot,
    new.fee_policy_version,
    new.cancellation_policy_version,
    new.terms_version,
    new.customer_authorization_version,
    new.policy_snapshot,
    new.customer_authorization_snapshot,
    new.replacement_for_booking_id
  ) is distinct from (
    old.booking_flow,
    old.customer_id,
    old.provider_id,
    old.service_id,
    old.estimated_minutes,
    old.job_zip,
    old.hourly_rate_cents_snapshot,
    old.platform_fee_bps,
    old.billing_minimum_minutes,
    old.billing_increment_minutes,
    old.cancellation_notice_hours,
    old.pilot_timezone,
    old.response_window_hours,
    old.response_alert_at,
    old.customer_name_snapshot,
    old.provider_display_name_snapshot,
    old.service_name_snapshot,
    old.fee_policy_version,
    old.cancellation_policy_version,
    old.terms_version,
    old.customer_authorization_version,
    old.policy_snapshot,
    old.customer_authorization_snapshot,
    old.replacement_for_booking_id
  ) then
    raise exception 'booking identity, pricing, and policy snapshots are immutable';
  end if;

  if (old.accepted_at is not null and new.accepted_at is distinct from old.accepted_at)
    or (
      old.initial_payment_due_at is not null
      and new.initial_payment_due_at is distinct from old.initial_payment_due_at
    )
    or (old.arrived_at is not null and new.arrived_at is distinct from old.arrived_at)
    or (
      old.work_completed_at is not null
      and new.work_completed_at is distinct from old.work_completed_at
    )
    or (old.cancelled_at is not null and new.cancelled_at is distinct from old.cancelled_at)
    or (old.withdrawn_at is not null and new.withdrawn_at is distinct from old.withdrawn_at)
    or (old.expired_at is not null and new.expired_at is distinct from old.expired_at)
    or (
      old.replaced_by_booking_id is not null
      and new.replaced_by_booking_id is distinct from old.replaced_by_booking_id
    ) then
    raise exception 'booking lifecycle timestamps and links cannot be rewritten';
  end if;

  return new;
end;
$$;

revoke execute on function private.enforce_booking_immutability()
  from public, anon, authenticated;

create trigger booking_immutable_contract
  before update on public.bookings
  for each row execute function private.enforce_booking_immutability();

-- Preserve the currently-live legacy transition rules while reserving all
-- hourly transitions for authenticated server operations.
create or replace function public.enforce_booking_transition()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  actor_is_provider boolean;
  actor_is_customer boolean;
begin
  if new.status = old.status then
    return new;
  end if;

  if old.booking_flow = 'legacy' then
    if not (
      (old.status = 'requested' and new.status in ('accepted', 'declined', 'cancelled')) or
      (old.status = 'accepted' and new.status in ('paid', 'cancelled')) or
      (old.status = 'paid' and new.status = 'completed')
    ) then
      raise exception 'illegal legacy booking transition: % -> %', old.status, new.status;
    end if;

    if auth.uid() is null then
      return new;
    end if;

    actor_is_provider := exists (
      select 1 from public.provider_profiles
      where id = new.provider_id and user_id = (select auth.uid())
    );
    actor_is_customer := new.customer_id = (select auth.uid());

    if new.status in ('accepted', 'declined', 'completed') and not actor_is_provider then
      raise exception 'only the provider can set status %', new.status;
    end if;
    if new.status in ('cancelled', 'paid') and not actor_is_customer then
      raise exception 'only the customer can set status %', new.status;
    end if;
    return new;
  end if;

  if auth.uid() is not null then
    raise exception 'hourly booking transitions require a server operation';
  end if;

  if not (
    (old.status = 'requested' and new.status in (
      'accepted', 'declined', 'withdrawn', 'expired', 'cancelled'
    )) or
    (old.status = 'accepted' and new.status in ('booked', 'expired', 'cancelled')) or
    (old.status = 'booked' and new.status in ('in_progress', 'disputed', 'cancelled')) or
    (old.status = 'in_progress' and new.status in ('invoice_review', 'disputed')) or
    (old.status = 'invoice_review' and new.status in ('completed', 'disputed')) or
    (old.status = 'disputed' and new.status in ('completed', 'cancelled'))
  ) then
    raise exception 'illegal hourly booking transition: % -> %', old.status, new.status;
  end if;

  return new;
end;
$$;

revoke execute on function public.enforce_booking_transition()
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Invoices, payments, refunds, disputes, audit, webhooks, and email outbox
-- ---------------------------------------------------------------------------

create table public.booking_invoices (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references public.bookings (id) on delete restrict,
  submitted_minutes smallint not null,
  estimated_minutes_snapshot smallint not null,
  hourly_rate_cents_snapshot integer not null,
  platform_fee_bps_snapshot smallint not null,
  provider_explanation text not null default '',
  subtotal_cents integer not null,
  total_platform_fee_cents integer not null,
  first_hour_credit_cents integer not null,
  remaining_balance_cents integer not null,
  status public.booking_invoice_status not null default 'draft',
  submitted_at timestamptz,
  autocharge_at timestamptz,
  customer_confirmed_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint booking_invoices_minutes_valid check (
    submitted_minutes between 60 and 1440 and submitted_minutes % 15 = 0
  ),
  constraint booking_invoices_estimate_valid check (
    estimated_minutes_snapshot between 60 and 720
    and estimated_minutes_snapshot % 15 = 0
  ),
  constraint booking_invoices_rate_valid check (
    hourly_rate_cents_snapshot between 2000 and 15000
  ),
  constraint booking_invoices_fee_bps_valid check (
    platform_fee_bps_snapshot = 500
  ),
  constraint booking_invoices_overage_explained check (
    submitted_minutes <= estimated_minutes_snapshot
    or char_length(btrim(provider_explanation)) > 0
  ),
  constraint booking_invoices_provider_explanation_length check (
    char_length(provider_explanation) <= 2000
  ),
  constraint booking_invoices_money_valid check (
    subtotal_cents = (
      (hourly_rate_cents_snapshot::bigint * submitted_minutes + 30) / 60
    )::integer
    and total_platform_fee_cents = (
      (subtotal_cents::bigint * platform_fee_bps_snapshot + 5000) / 10000
    )::integer
    and first_hour_credit_cents = hourly_rate_cents_snapshot
    and remaining_balance_cents = greatest(0, subtotal_cents - first_hour_credit_cents)
  ),
  constraint booking_invoices_autocharge_deadline_valid check (
    (submitted_at is null and autocharge_at is null)
    or (
      submitted_at is not null
      and autocharge_at = submitted_at + interval '24 hours'
    )
  )
);

create index booking_invoices_status_autocharge_idx
  on public.booking_invoices (status, autocharge_at);

create table public.booking_payments (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id) on delete restrict,
  invoice_id uuid references public.booking_invoices (id) on delete restrict,
  kind public.booking_payment_kind not null,
  amount_cents integer not null check (amount_cents > 0),
  application_fee_cents integer not null,
  currency text not null default 'usd',
  status public.booking_payment_status not null default 'created',
  idempotency_key text not null unique,
  stripe_payment_intent_id text unique,
  stripe_customer_id text,
  stripe_payment_method_id text,
  stripe_connected_account_id text not null,
  customer_authorization_version text not null,
  authorized_at timestamptz,
  action_required_reason text,
  failure_code text,
  failure_message text,
  failure_details jsonb,
  succeeded_at timestamptz,
  failed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint booking_payments_application_fee_valid check (
    application_fee_cents between 0 and amount_cents
  ),
  constraint booking_payments_currency_valid check (currency = 'usd'),
  constraint booking_payments_authorization_version_not_blank check (
    btrim(customer_authorization_version) <> ''
  ),
  constraint booking_payments_kind_invoice_shape check (
    (kind = 'first_hour' and invoice_id is null)
    or (kind = 'balance' and invoice_id is not null)
  ),
  unique (booking_id, kind)
);

create index booking_payments_invoice_id_idx
  on public.booking_payments (invoice_id)
  where invoice_id is not null;
create index booking_payments_status_updated_idx
  on public.booking_payments (status, updated_at);

create table public.booking_refunds (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id) on delete restrict,
  payment_id uuid not null references public.booking_payments (id) on delete restrict,
  amount_cents integer not null check (amount_cents > 0),
  reason text not null,
  status public.booking_refund_status not null default 'created',
  idempotency_key text not null unique,
  stripe_refund_id text unique,
  reverse_transfer boolean not null default true,
  refund_application_fee boolean not null default true,
  stripe_transfer_reversal_id text,
  reversal_metadata jsonb,
  failure_code text,
  failure_message text,
  succeeded_at timestamptz,
  failed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint booking_refunds_reason_not_blank check (btrim(reason) <> '')
);

create index booking_refunds_booking_id_idx on public.booking_refunds (booking_id);
create index booking_refunds_payment_id_idx on public.booking_refunds (payment_id);
create index booking_refunds_status_updated_idx
  on public.booking_refunds (status, updated_at);

create table public.booking_disputes (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references public.bookings (id) on delete restrict,
  customer_id uuid not null references public.profiles (id) on delete restrict,
  category public.booking_dispute_category not null,
  narrative text not null,
  status public.booking_dispute_status not null default 'open',
  opened_at timestamptz not null default now(),
  dispute_due_at timestamptz,
  resolution_kind public.booking_dispute_resolution,
  resolved_billable_minutes smallint,
  resolver_id uuid references public.profiles (id) on delete restrict,
  resolved_at timestamptz,
  audit_note text,
  created_at timestamptz not null default now(),

  constraint booking_disputes_narrative_length check (
    char_length(btrim(narrative)) between 10 and 5000
  ),
  constraint booking_disputes_resolution_minutes_valid check (
    resolved_billable_minutes is null
    or (
      resolved_billable_minutes between 60 and 1440
      and resolved_billable_minutes % 15 = 0
    )
  ),
  constraint booking_disputes_resolution_shape check (
    (
      status = 'open'
      and resolution_kind is null
      and resolver_id is null
      and resolved_at is null
      and audit_note is null
    )
    or (
      status = 'resolved'
      and resolution_kind is not null
      and resolver_id is not null
      and resolved_at is not null
      and audit_note is not null
      and btrim(audit_note) <> ''
      and (
        resolution_kind = 'reduce_billable_minutes'
        or resolved_billable_minutes is null
      )
      and (
        resolution_kind <> 'reduce_billable_minutes'
        or resolved_billable_minutes is not null
      )
    )
  )
);

create index booking_disputes_customer_id_idx on public.booking_disputes (customer_id);
create index booking_disputes_resolver_id_idx
  on public.booking_disputes (resolver_id)
  where resolver_id is not null;
create index booking_disputes_status_opened_idx
  on public.booking_disputes (status, opened_at);

create table public.booking_audit_events (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id) on delete restrict,
  actor_user_id uuid references public.profiles (id) on delete set null,
  actor_kind text not null,
  action text not null,
  from_status public.booking_status,
  to_status public.booking_status,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),

  constraint booking_audit_events_actor_kind_valid check (
    actor_kind in ('customer', 'provider', 'admin', 'system', 'stripe')
  ),
  constraint booking_audit_events_action_not_blank check (btrim(action) <> '')
);

create index booking_audit_events_booking_created_idx
  on public.booking_audit_events (booking_id, created_at);
create index booking_audit_events_actor_user_id_idx
  on public.booking_audit_events (actor_user_id)
  where actor_user_id is not null;

create table public.stripe_webhook_receipts (
  id uuid primary key default gen_random_uuid(),
  stripe_event_id text not null unique,
  event_type text not null,
  livemode boolean not null,
  api_version text,
  payload jsonb not null,
  received_at timestamptz not null default now(),
  processing_started_at timestamptz,
  processed_at timestamptz,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  next_attempt_at timestamptz,
  last_error text,

  constraint stripe_webhook_receipts_event_not_blank check (
    btrim(stripe_event_id) <> '' and btrim(event_type) <> ''
  )
);

create index stripe_webhook_receipts_retry_idx
  on public.stripe_webhook_receipts (next_attempt_at, received_at)
  where processed_at is null;

create table public.email_outbox (
  id uuid primary key default gen_random_uuid(),
  event_key text not null unique,
  booking_id uuid references public.bookings (id) on delete restrict,
  recipient_user_id uuid references public.profiles (id) on delete set null,
  recipient_email text not null,
  template text not null,
  payload jsonb not null default '{}'::jsonb,
  status public.email_outbox_status not null default 'pending',
  attempt_count integer not null default 0 check (attempt_count >= 0),
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint email_outbox_event_key_not_blank check (btrim(event_key) <> ''),
  constraint email_outbox_recipient_not_blank check (btrim(recipient_email) <> ''),
  constraint email_outbox_template_not_blank check (btrim(template) <> '')
);

create index email_outbox_delivery_idx
  on public.email_outbox (status, available_at);
create index email_outbox_booking_id_idx
  on public.email_outbox (booking_id)
  where booking_id is not null;
create index email_outbox_recipient_user_id_idx
  on public.email_outbox (recipient_user_id)
  where recipient_user_id is not null;

-- Audit rows are append-only, including for privileged callers.
create function private.reject_update_or_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception '% is append-only', tg_table_name;
end;
$$;

revoke execute on function private.reject_update_or_delete()
  from public, anon, authenticated;

create trigger booking_audit_events_append_only
  before update or delete on public.booking_audit_events
  for each row execute function private.reject_update_or_delete();

-- ---------------------------------------------------------------------------
-- RLS, least-privilege grants, and sanitized public directory views
-- ---------------------------------------------------------------------------

alter table public.booking_invoices enable row level security;
alter table public.booking_payments enable row level security;
alter table public.booking_refunds enable row level security;
alter table public.booking_disputes enable row level security;
alter table public.booking_audit_events enable row level security;
alter table public.stripe_webhook_receipts enable row level security;
alter table public.email_outbox enable row level security;

create policy "Participants and admins read booking invoices"
  on public.booking_invoices for select to authenticated
  using (
    exists (
      select 1
      from public.bookings b
      where b.id = booking_id
        and (
          b.customer_id = (select auth.uid())
          or public.owns_provider_profile(b.provider_id)
          or public.is_admin()
        )
    )
  );

create policy "Participants and admins read booking disputes"
  on public.booking_disputes for select to authenticated
  using (
    exists (
      select 1
      from public.bookings b
      where b.id = booking_id
        and (
          b.customer_id = (select auth.uid())
          or public.owns_provider_profile(b.provider_id)
          or public.is_admin()
        )
    )
  );

-- The project previously opted into blanket Data API grants. Restore the
-- current explicit-grant model for all future public objects.
alter default privileges in schema public
  revoke all on tables from anon, authenticated;
alter default privileges in schema public
  revoke all on sequences from anon, authenticated;
alter default privileges in schema public
  revoke execute on routines from public, anon, authenticated;

-- Ari's per-booking conversation RPC remains the authoritative implementation,
-- but SECURITY DEFINER functions receive PUBLIC execute by default. Preserve
-- its intended authenticated-only API surface explicitly.
revoke execute on function public.claim_conversation_for_booking(uuid)
  from public, anon;
grant execute on function public.claim_conversation_for_booking(uuid)
  to authenticated;

revoke all on table
  public.booking_invoices,
  public.booking_payments,
  public.booking_refunds,
  public.booking_disputes,
  public.booking_audit_events,
  public.stripe_webhook_receipts,
  public.email_outbox
from anon, authenticated;

grant select on table public.booking_invoices, public.booking_disputes
  to authenticated;
grant all on table
  public.booking_invoices,
  public.booking_payments,
  public.booking_refunds,
  public.booking_disputes,
  public.booking_audit_events,
  public.stripe_webhook_receipts,
  public.email_outbox
to service_role;

-- Provider base rows keep only safe public columns browser-readable. Owners
-- and admins load private settings through authorized server-only reads.
revoke all on table public.provider_profiles from anon, authenticated;
grant select (
  id,
  display_name,
  bio,
  provider_type,
  neighborhood,
  availability,
  availability_weekdays,
  availability_start_local,
  availability_end_local,
  availability_note,
  created_at
) on table public.provider_profiles to anon, authenticated;
grant insert (user_id, display_name)
  on table public.provider_profiles to authenticated;
grant update (
  provider_type,
  neighborhood,
  availability,
  availability_weekdays,
  availability_start_local,
  availability_end_local,
  availability_note,
  service_zip,
  minimum_notice_hours,
  id_document_url,
  id_document_back_url
) on table public.provider_profiles to authenticated;

revoke all on table public.profile_moderation_events from anon, authenticated;
grant select on table public.profile_moderation_events to authenticated;

-- Offerings contain public catalog/pricing fields. RLS still gates them on the
-- provider's approval and the service's live state.
revoke all on table public.provider_services from anon, authenticated;
grant select (
  id,
  provider_id,
  service_id,
  price_cents,
  price_type,
  unit,
  preview_image_path,
  hourly_rate_cents
) on table public.provider_services to anon, authenticated;
grant insert (
  provider_id,
  service_id,
  price_cents,
  price_type,
  unit,
  preview_image_path,
  hourly_rate_cents
) on table public.provider_services to authenticated;
grant update (
  price_cents,
  price_type,
  unit,
  preview_image_path,
  hourly_rate_cents
) on table public.provider_services to authenticated;
grant delete on table public.provider_services to authenticated;

-- Retain the live legacy booking surface, but remove irrelevant blanket
-- privileges. Phase 3 replaces these writes with trusted hourly operations.
revoke all on table public.bookings from anon, authenticated;
grant select on table public.bookings to authenticated;
grant insert (
  customer_id,
  provider_id,
  service_id,
  scheduled_at,
  address,
  details,
  price_cents,
  platform_fee_cents
) on table public.bookings to authenticated;
grant update (status, dismissed_at) on table public.bookings to authenticated;

-- The invoker views must enforce approval without granting browser roles
-- direct SELECT access to the internal verification_status column. This
-- narrow predicate reveals only the public fact that a profile is approved.
create function public.is_provider_approved(provider_profile_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.provider_profiles
    where id = provider_profile_id and verification_status = 'approved'
  );
$$;

revoke all on function public.is_provider_approved(uuid)
  from public, anon, authenticated;
grant execute on function public.is_provider_approved(uuid)
  to anon, authenticated, service_role;

create view public.public_provider_directory
with (security_invoker = true) as
  select
    pp.id as provider_id,
    pp.display_name,
    pp.bio,
    pp.provider_type,
    pp.neighborhood,
    pp.availability,
    pp.availability_weekdays,
    pp.availability_start_local,
    pp.availability_end_local,
    pp.availability_note,
    pp.created_at
  from public.provider_profiles pp
  where public.is_provider_approved(pp.id);

create view public.public_provider_offerings
with (security_invoker = true) as
  select
    ps.id as provider_service_id,
    ps.provider_id,
    ps.service_id,
    ps.price_cents,
    ps.price_type,
    ps.unit,
    ps.preview_image_path,
    ps.hourly_rate_cents,
    s.name as service_name,
    s.slug as service_slug,
    s.category as service_category,
    s.is_live as service_is_live
  from public.provider_services ps
  join public.services s on s.id = ps.service_id
  join public.provider_profiles pp on pp.id = ps.provider_id
  where public.is_provider_approved(pp.id)
    and s.is_live;

revoke all on table public.public_provider_directory, public.public_provider_offerings
  from anon, authenticated;
grant select on table public.public_provider_directory, public.public_provider_offerings
  to anon, authenticated;

comment on view public.public_provider_directory is
  'Sanitized provider directory. Excludes user IDs, private ZIPs, Stripe IDs, identity documents, and internal verification fields.';
comment on view public.public_provider_offerings is
  'Sanitized live offering rows for approved providers.';
