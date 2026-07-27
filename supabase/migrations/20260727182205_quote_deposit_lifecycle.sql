-- Quote v2: 20% deposit held by College Crew, fixed remaining balance after
-- completion, and the same invoice/recovery/dispute/payout rails as hourly.

update private.current_legal_document_contract
set version = '2026-07-27',
    content_hash = '4d0c985ce3809af8b6dacd25728ae38677164470553f2f2ac440d7a2e79f7c9d'
where kind = 'customer_booking_terms';

-- ---------------------------------------------------------------------------
-- Immutable quote/deposit snapshots and generic invoice shape
-- ---------------------------------------------------------------------------

alter table public.bookings
  add column if not exists deposit_bps smallint,
  add column if not exists upfront_payment_cents integer,
  add column if not exists requested_local_date date,
  add column if not exists requested_daypart public.quote_daypart,
  add column if not exists quote_negotiation_round smallint not null default 0;

alter table public.bookings alter column scheduled_at drop not null;

alter table public.bookings
  drop constraint if exists bookings_flow_contract_complete,
  drop constraint if exists bookings_quote_amount_contract;

alter table public.bookings
  add constraint bookings_flow_contract_complete check (
    booking_flow = 'legacy'
    or (
      booking_flow = 'hourly_v1'
      and estimated_minutes is not null
      and job_zip is not null
      and hourly_rate_cents_snapshot is not null
      and average_quote_cents_snapshot is null
      and quote_sent_at is null
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
    or (
      booking_flow = 'quote_v1'
      and estimated_minutes is not null
      and job_zip is not null
      and hourly_rate_cents_snapshot is null
      and platform_fee_bps = 500
      and billing_minimum_minutes is null
      and billing_increment_minutes is null
      and cancellation_notice_hours is null
      and pilot_timezone = 'America/Chicago'
      and response_window_hours is not null
      and response_alert_at is not null
      and customer_name_snapshot is not null
      and btrim(customer_name_snapshot) <> ''
      and provider_display_name_snapshot is not null
      and btrim(provider_display_name_snapshot) <> ''
      and service_name_snapshot is not null
      and btrim(service_name_snapshot) <> ''
      and fee_policy_version = 'quote-v1-500bps'
      and cancellation_policy_version = 'quote-v1-before-payment'
      and terms_version = 'quote-v1-2026-07-20'
      and customer_authorization_version = 'quote-v1-final-price-at-payment'
      and policy_snapshot is not null
      and customer_authorization_snapshot is not null
    )
    or (
      booking_flow = 'quote_v2'
      and job_zip is not null
      and requested_local_date is not null
      and requested_daypart is not null
      and hourly_rate_cents_snapshot is null
      and platform_fee_bps = 500
      and deposit_bps = 2000
      and billing_minimum_minutes is null
      and billing_increment_minutes is null
      and cancellation_notice_hours = 12
      and pilot_timezone = 'America/Chicago'
      and response_window_hours = 2
      and response_alert_at is not null
      and customer_name_snapshot is not null
      and provider_display_name_snapshot is not null
      and service_name_snapshot is not null
      and fee_policy_version = 'quote-v2-500bps'
      and cancellation_policy_version = 'quote-v2-12h'
      and terms_version = '2026-07-27'
      and customer_authorization_version = 'quote-v2-20pct-deposit'
      and policy_snapshot is not null
      and customer_authorization_snapshot is not null
      and (
        (quote_sent_at is null and price_cents = 0
          and (
            (scheduled_at is null and estimated_minutes is null)
            or (
              status = 'requested'
              and scheduled_at is not null
              and estimated_minutes is null
            )
          )
          and upfront_payment_cents is null
          and status in (
            'requested', 'countered', 'declined', 'withdrawn', 'expired', 'cancelled'
          ))
        or
        (quote_sent_at is not null and price_cents between 2000 and 1000000
          and scheduled_at is not null
          and estimated_minutes is null
          and upfront_payment_cents =
            ((price_cents::bigint * deposit_bps + 5000) / 10000)::integer
          and platform_fee_cents =
            ((price_cents::bigint * platform_fee_bps + 5000) / 10000)::integer
          and status in (
            'accepted', 'booked', 'in_progress', 'invoice_review',
            'completed', 'disputed', 'cancelled', 'expired'
          ))
      )
    )
  ),
  add constraint bookings_quote_amount_contract check (
    booking_flow not in ('quote_v1', 'quote_v2')
    or (
      quote_sent_at is null
      and price_cents = 0
      and platform_fee_cents = 0
      and upfront_payment_cents is null
      and status in (
        'requested', 'countered', 'declined', 'withdrawn', 'expired', 'cancelled'
      )
    )
    or (
      booking_flow = 'quote_v1'
      and quote_sent_at is not null
      and price_cents between 2000 and 1000000
      and platform_fee_cents =
        round(price_cents::numeric * platform_fee_bps / 10000)::integer
      and status in ('accepted', 'paid', 'completed', 'cancelled')
    )
    or (
      booking_flow = 'quote_v2'
      and quote_sent_at is not null
      and price_cents between 2000 and 1000000
      and upfront_payment_cents =
        ((price_cents::bigint * deposit_bps + 5000) / 10000)::integer
      and platform_fee_cents =
        ((price_cents::bigint * platform_fee_bps + 5000) / 10000)::integer
      and status in (
        'accepted', 'booked', 'in_progress', 'invoice_review',
        'completed', 'disputed', 'cancelled', 'expired'
      )
    )
  );

alter table public.booking_invoices
  add column if not exists billing_basis text not null default 'hourly',
  add column if not exists quote_total_cents_snapshot integer;

alter table public.booking_invoices
  alter column submitted_minutes drop not null,
  alter column hourly_rate_cents_snapshot drop not null,
  alter column estimated_minutes_snapshot drop not null;

alter table public.booking_invoices
  drop constraint if exists booking_invoices_minutes_valid,
  drop constraint if exists booking_invoices_rate_valid,
  drop constraint if exists booking_invoices_overage_explained,
  drop constraint if exists booking_invoices_money_valid;

alter table public.booking_invoices
  add constraint booking_invoices_basis_valid
    check (billing_basis in ('hourly', 'fixed_quote')),
  add constraint booking_invoices_shape_valid check (
    (
      billing_basis = 'hourly'
      and submitted_minutes between 60 and 1440
      and submitted_minutes % 15 = 0
      and hourly_rate_cents_snapshot between 2000 and 15000
      and quote_total_cents_snapshot is null
      and (
        submitted_minutes <= estimated_minutes_snapshot
        or char_length(btrim(provider_explanation)) > 0
      )
      and subtotal_cents =
        ((hourly_rate_cents_snapshot::bigint * submitted_minutes + 30) / 60)::integer
      and first_hour_credit_cents = hourly_rate_cents_snapshot
    )
    or (
      billing_basis = 'fixed_quote'
      and submitted_minutes is null
      and estimated_minutes_snapshot is null
      and hourly_rate_cents_snapshot is null
      and quote_total_cents_snapshot between 2000 and 1000000
      and subtotal_cents = quote_total_cents_snapshot
      and first_hour_credit_cents =
        ((quote_total_cents_snapshot::bigint * 2000 + 5000) / 10000)::integer
    )
  ),
  add constraint booking_invoices_money_valid check (
    total_platform_fee_cents =
      ((subtotal_cents::bigint * platform_fee_bps_snapshot + 5000) / 10000)::integer
    and remaining_balance_cents =
      greatest(0, subtotal_cents - first_hour_credit_cents)
  );

alter table public.booking_payments
  drop constraint if exists booking_payments_kind_invoice_shape;
alter table public.booking_payments
  add constraint booking_payments_kind_invoice_shape check (
    (kind in ('first_hour', 'quote_deposit') and invoice_id is null)
    or (kind = 'balance' and invoice_id is not null)
  );

alter table public.booking_automation_jobs
  drop constraint if exists booking_automation_jobs_kind_valid;
alter table public.booking_automation_jobs
  add constraint booking_automation_jobs_kind_valid check (kind = any (array[
    'response_alert', 'request_expiration', 'payment_expiration',
    'invoice_autocharge', 'completion_timeout', 'provider_payout',
    'capture_upfront', 'capture_expiration',
    'quote_response_expiration', 'quote_payment_expiration'
  ]));

alter table public.booking_drafts
  add column if not exists cleanup_status text not null default 'pending',
  add column if not exists cleanup_attempt_count smallint not null default 0,
  add column if not exists cleanup_next_attempt_at timestamptz,
  add column if not exists cleanup_lease_token uuid,
  add column if not exists cleanup_lease_expires_at timestamptz,
  add column if not exists cleanup_last_error text,
  add constraint booking_drafts_cleanup_status_valid check (
    cleanup_status in ('pending', 'processing', 'failed')
  );

create or replace function public.claim_expired_booking_drafts(
  p_limit integer default 20,
  p_lease_seconds integer default 120
)
returns table (
  draft_id uuid,
  stripe_payment_intent_id text,
  lease_token uuid,
  attempt_count smallint
)
language plpgsql security definer set search_path = ''
as $$
begin
  return query
  with due as (
    select d.id from public.booking_drafts d
    where d.expires_at <= statement_timestamp()
      and d.cleanup_status <> 'failed'
      and coalesce(d.cleanup_next_attempt_at, d.expires_at) <= statement_timestamp()
      and (
        d.cleanup_status = 'pending'
        or d.cleanup_lease_expires_at <= statement_timestamp()
      )
    order by d.expires_at
    for update skip locked
    limit greatest(1, least(p_limit, 100))
  )
  update public.booking_drafts d
  set cleanup_status = 'processing',
      cleanup_attempt_count = (d.cleanup_attempt_count + 1)::smallint,
      cleanup_lease_token = gen_random_uuid(),
      cleanup_lease_expires_at =
        statement_timestamp() + make_interval(secs => p_lease_seconds)
  from due where d.id = due.id
  returning d.id, d.stripe_payment_intent_id, d.cleanup_lease_token,
    d.cleanup_attempt_count;
end;
$$;

create or replace function public.complete_booking_draft_cleanup(
  p_draft_id uuid,
  p_lease_token uuid
)
returns boolean language plpgsql security definer set search_path = ''
as $$
begin
  delete from public.booking_drafts
  where id = p_draft_id and cleanup_status = 'processing'
    and cleanup_lease_token = p_lease_token;
  return found;
end;
$$;

create or replace function public.retry_booking_draft_cleanup(
  p_draft_id uuid,
  p_lease_token uuid,
  p_error text,
  p_retry_after_seconds integer,
  p_terminal boolean default false
)
returns boolean language plpgsql security definer set search_path = ''
as $$
begin
  update public.booking_drafts set
    cleanup_status = case when p_terminal then 'failed' else 'pending' end,
    cleanup_next_attempt_at = case when p_terminal then null
      else statement_timestamp() + make_interval(secs => p_retry_after_seconds) end,
    cleanup_lease_token = null, cleanup_lease_expires_at = null,
    cleanup_last_error = left(coalesce(p_error, 'cleanup_failed'), 200)
  where id = p_draft_id and cleanup_status = 'processing'
    and cleanup_lease_token = p_lease_token;
  return found;
end;
$$;

create or replace function public.finalize_hourly_booking(
  p_stripe_payment_intent_id text
)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_draft public.booking_drafts%rowtype;
  v_booking_id uuid;
  v_account text;
  v_fee integer;
  v_auth text;
begin
  select d.* into v_draft from public.booking_drafts d
  where d.stripe_payment_intent_id = p_stripe_payment_intent_id
    and d.customer_id = v_actor for update;
  if not found then raise exception 'DRAFT_NOT_FOUND'; end if;
  if v_draft.expires_at <= statement_timestamp()
    or v_draft.cleanup_status <> 'pending' then
    raise exception 'DRAFT_EXPIRED';
  end if;
  if exists (select 1 from public.bookings b where b.id = v_draft.booking_id) then
    delete from public.booking_drafts where id = v_draft.id;
    return v_draft.booking_id;
  end if;
  perform private.assert_can_book_hourly(v_draft.provider_service_id);
  perform set_config('college_crew.hourly_legal_publication', 'on', true);
  v_booking_id := private.create_hourly_booking_request_unchecked(
    v_draft.provider_service_id, v_draft.scheduled_at, v_draft.estimated_minutes,
    2, v_draft.address, v_draft.job_zip, v_draft.details,
    v_draft.address_kind, v_draft.service_city, v_draft.latitude,
    v_draft.longitude, v_draft.on_decline_preference, v_draft.booking_id,
    v_draft.time_flexibility
  );
  select pp.stripe_account_id, b.customer_authorization_version
  into v_account, v_auth from public.bookings b
  join public.provider_profiles pp on pp.id = b.provider_id
  where b.id = v_booking_id;
  if coalesce(btrim(v_account), '') = '' then
    raise exception 'PROVIDER_NOT_PAYOUT_READY';
  end if;
  v_fee := ((v_draft.hourly_rate_cents::bigint * 500 + 5000) / 10000)::integer;
  insert into public.booking_payments (
    booking_id, kind, amount_cents, application_fee_cents, currency, status,
    idempotency_key, stripe_connected_account_id, stripe_payment_intent_id,
    stripe_customer_id, customer_authorization_version, authorized_at
  ) values (
    v_booking_id, 'first_hour', v_draft.hourly_rate_cents, v_fee, 'usd',
    'authorized', 'fh_' || v_booking_id::text, v_account,
    p_stripe_payment_intent_id, v_draft.stripe_customer_id, v_auth,
    statement_timestamp()
  );
  if v_draft.original_booking_id is not null then
    perform set_config('college_crew.trusted_booking_operation', 'on', true);
    update public.bookings set status = 'withdrawn',
      withdrawn_at = statement_timestamp(), withdrawn_by = v_actor
    where id = v_draft.original_booking_id and customer_id = v_actor
      and booking_flow = 'hourly_v1'
      and status = 'requested';
  end if;
  delete from public.booking_drafts where id = v_draft.id;
  return v_booking_id;
end;
$$;

drop function if exists public.create_booking_draft(
  uuid, uuid, timestamptz, integer, text, text, text, text, text,
  public.booking_decline_preference, integer, text, text,
  double precision, double precision
);

create or replace function public.create_booking_draft(
  p_booking_id uuid,
  p_provider_service_id uuid,
  p_scheduled_at timestamptz,
  p_estimated_minutes integer,
  p_details text,
  p_address text,
  p_job_zip text,
  p_address_kind text,
  p_service_city text,
  p_on_decline_preference public.booking_decline_preference,
  p_hourly_rate_cents integer,
  p_stripe_payment_intent_id text,
  p_stripe_customer_id text,
  p_latitude double precision default null,
  p_longitude double precision default null,
  p_original_booking_id uuid default null,
  p_time_flexibility public.booking_time_flexibility default 'fixed'
)
returns void language plpgsql security definer set search_path = ''
as $$
declare v_actor uuid := (select auth.uid());
begin
  if v_actor is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_scheduled_at <= statement_timestamp() then raise exception 'REQUEST_EXPIRED'; end if;
  if p_original_booking_id is not null and not exists (
    select 1 from public.bookings b
    where b.id = p_original_booking_id and b.customer_id = v_actor
      and b.booking_flow = 'hourly_v1'
      and (
        b.status in ('requested', 'declined', 'expired')
        or (b.status = 'cancelled' and b.cancelled_by_role = 'provider')
      )
  ) then raise exception 'REPLACEMENT_NOT_AVAILABLE_YET'; end if;
  insert into public.booking_drafts (
    booking_id, customer_id, provider_service_id, scheduled_at,
    estimated_minutes, details, address, job_zip, address_kind, service_city,
    latitude, longitude, on_decline_preference, hourly_rate_cents,
    stripe_payment_intent_id, stripe_customer_id, original_booking_id,
    time_flexibility, expires_at, cleanup_status
  ) values (
    p_booking_id, v_actor, p_provider_service_id, p_scheduled_at,
    p_estimated_minutes, coalesce(p_details, ''), p_address, p_job_zip,
    coalesce(p_address_kind, 'home'), coalesce(p_service_city, ''),
    p_latitude, p_longitude, coalesce(p_on_decline_preference, 'keep_control'),
    p_hourly_rate_cents, p_stripe_payment_intent_id, p_stripe_customer_id,
    p_original_booking_id, coalesce(p_time_flexibility, 'fixed'),
    statement_timestamp() + interval '1 hour', 'pending'
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Quote request, quote response, deposit preparation, and webhook settlement
-- ---------------------------------------------------------------------------

create or replace function public.create_quote_deposit_booking_request(
  p_provider_service_id uuid,
  p_scheduled_at timestamptz,
  p_estimated_minutes integer,
  p_address text,
  p_job_zip text,
  p_job_photos jsonb,
  p_details text default '',
  p_address_kind text default 'home',
  p_service_city text default '',
  p_latitude double precision default null,
  p_longitude double precision default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_now timestamptz := statement_timestamp();
begin
  if p_scheduled_at < v_now + interval '12 hours' then
    raise exception 'MINIMUM_NOTICE_NOT_MET';
  end if;

  -- Reuse the hardened photo, address, availability, identity, and legal checks
  -- from quote_v1, then atomically promote the new row to the deposit contract.
  v_id := public.create_quote_booking_request(
    p_provider_service_id, p_scheduled_at, p_estimated_minutes, 2,
    p_address, p_job_zip, p_job_photos, p_details, p_address_kind,
    p_service_city, p_latitude, p_longitude
  );

  update public.bookings
  set
    booking_flow = 'quote_v2',
    response_window_hours = 2,
    response_alert_at = v_now + interval '2 hours',
    deposit_bps = 2000,
    cancellation_notice_hours = 12,
    fee_policy_version = 'quote-v2-500bps',
    cancellation_policy_version = 'quote-v2-12h',
    terms_version = '2026-07-27',
    customer_authorization_version = 'quote-v2-20pct-deposit',
    policy_snapshot = policy_snapshot || jsonb_build_object(
      'deposit_bps', 2000,
      'response_window_hours', 2,
      'minimum_notice_hours', 12,
      'quote_payment_rule', 'earlier_of_24h_or_6h_before_start'
    ),
    customer_authorization_snapshot = jsonb_build_object(
      'version', 'quote-v2-20pct-deposit',
      'scope', 'booking_only',
      'deposit_bps', 2000,
      'remaining_balance_after_job', true,
      'saved_method_authorization_required_at_deposit', true
    )
  where id = v_id and booking_flow = 'quote_v1';

  perform private.enqueue_booking_automation_job(
    'quote_response_expiration_' || v_id::text,
    'quote_response_expiration', v_id, v_id, v_now + interval '2 hours'
  );
  perform private.enqueue_participant_email(
    'quote_request_new_' || v_id::text, v_id, 'provider',
    'new_provider_request', jsonb_build_object('booking_id', v_id)
  );
  return v_id;
end;
$$;

revoke all on function public.create_quote_deposit_booking_request(
  uuid, timestamptz, integer, text, text, jsonb, text, text, text,
  double precision, double precision
) from public, anon;
grant execute on function public.create_quote_deposit_booking_request(
  uuid, timestamptz, integer, text, text, jsonb, text, text, text,
  double precision, double precision
) to authenticated;

create or replace function public.send_booking_quote(
  p_booking_id uuid,
  p_quote_cents integer
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
  v_due timestamptz;
  v_deposit integer;
begin
  if p_quote_cents is null or p_quote_cents not between 2000 and 1000000 then
    raise exception 'INVALID_FINAL_QUOTE';
  end if;
  select b.* into v_booking
  from public.bookings b
  join public.provider_profiles pp on pp.id = b.provider_id
  where b.id = p_booking_id
    and b.booking_flow in ('quote_v1', 'quote_v2')
    and pp.user_id = v_actor
  for update of b;
  if not found then raise exception 'BOOKING_NOT_FOUND'; end if;
  if v_booking.booking_flow = 'quote_v1' then
    -- Legacy quote rows remain readable/payable under their original contract.
    raise exception 'LEGACY_QUOTE_READ_ONLY';
  end if;
  if v_booking.status <> 'requested' then
    raise exception 'REQUEST_NO_LONGER_OPEN:%', v_booking.status;
  end if;
  if v_booking.response_alert_at <= v_now or v_booking.scheduled_at <= v_now then
    perform set_config('college_crew.trusted_booking_operation', 'on', true);
    update public.bookings set status = 'expired', expired_at = v_now
    where id = p_booking_id and status = 'requested';
    raise exception 'REQUEST_EXPIRED';
  end if;
  if not private.has_current_legal_document(v_actor, 'platform_terms')
    or not private.has_current_legal_document(v_actor, 'provider_terms') then
    raise exception 'LEGAL_ACCEPTANCE_REQUIRED';
  end if;
  if not exists (
    select 1 from public.provider_services ps
    where ps.provider_id = v_booking.provider_id
      and ps.service_id = v_booking.service_id
      and public.is_provider_offering_quote_bookable(ps.id)
  ) then raise exception 'PROVIDER_NO_LONGER_READY'; end if;

  perform pg_advisory_xact_lock(hashtextextended(v_booking.provider_id::text, 0));
  if private.provider_has_reserved_slot_conflict(
    v_booking.provider_id, v_booking.scheduled_at,
    v_booking.estimated_minutes, v_booking.id
  ) then raise exception 'PROVIDER_SLOT_ALREADY_RESERVED'; end if;

  v_deposit := ((p_quote_cents::bigint * 2000 + 5000) / 10000)::integer;
  v_due := least(v_now + interval '24 hours',
                 v_booking.scheduled_at - interval '6 hours');
  if v_due <= v_now then raise exception 'QUOTE_PAYMENT_WINDOW_UNAVAILABLE'; end if;

  perform set_config('college_crew.trusted_booking_operation', 'on', true);
  update public.bookings
  set price_cents = p_quote_cents,
      platform_fee_cents =
        ((p_quote_cents::bigint * 500 + 5000) / 10000)::integer,
      upfront_payment_cents = v_deposit,
      quote_sent_at = v_now,
      accepted_at = v_now,
      initial_payment_due_at = v_due,
      status = 'accepted'
  where id = p_booking_id and status = 'requested';

  perform private.enqueue_booking_automation_job(
    'quote_payment_expiration_' || p_booking_id::text,
    'quote_payment_expiration', p_booking_id, p_booking_id, v_due
  );
  return p_booking_id;
end;
$$;

create or replace function public.replace_quote_booking_request(
  p_original_booking_id uuid,
  p_provider_service_id uuid,
  p_scheduled_at timestamptz default null
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_now timestamptz := statement_timestamp();
  v_original public.bookings%rowtype;
  v_start timestamptz;
  v_new uuid;
begin
  select b.* into v_original from public.bookings b
  where b.id = p_original_booking_id and b.customer_id = v_actor
    and b.booking_flow = 'quote_v2' for update;
  if not found then raise exception 'BOOKING_NOT_FOUND'; end if;
  if not (
    v_original.status in ('declined', 'expired')
    or (v_original.status = 'cancelled'
      and v_original.cancelled_by_role = 'provider')
  ) then raise exception 'REPLACEMENT_NOT_AVAILABLE_YET'; end if;
  if not exists (
    select 1 from public.provider_services ps
    where ps.id = p_provider_service_id
      and ps.service_id = v_original.service_id
      and ps.provider_id <> v_original.provider_id
      and public.is_provider_offering_quote_bookable(ps.id)
  ) then raise exception 'OFFERING_NOT_BOOKABLE'; end if;

  v_start := coalesce(p_scheduled_at, v_original.scheduled_at);
  if v_start < v_now + interval '12 hours' then
    raise exception 'NEW_TIME_REQUIRED';
  end if;
  v_new := public.create_quote_deposit_booking_request(
    p_provider_service_id, v_start, v_original.estimated_minutes,
    v_original.address, v_original.job_zip, v_original.job_photos,
    v_original.details, v_original.address_kind, v_original.service_city,
    v_original.latitude, v_original.longitude
  );
  update public.bookings set replacement_for_booking_id = v_original.id
  where id = v_new;
  update public.bookings set replaced_by_booking_id = v_new
  where id = v_original.id;
  return v_new;
end;
$$;

create or replace function public.begin_quote_deposit(
  p_booking_id uuid,
  p_authorization_version text
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
  v_booking public.bookings%rowtype;
  v_account text;
  v_payment public.booking_payments%rowtype;
  v_deposit_fee integer;
begin
  select b.* into v_booking
  from public.bookings b
  where b.id = p_booking_id and b.customer_id = v_actor
    and b.booking_flow = 'quote_v2'
  for update;
  if not found then raise exception 'BOOKING_NOT_FOUND'; end if;
  if v_booking.status <> 'accepted' then
    raise exception 'BOOKING_NOT_AWAITING_PAYMENT';
  end if;
  if v_booking.initial_payment_due_at is null
    or v_booking.initial_payment_due_at <= v_now then
    raise exception 'PAYMENT_WINDOW_CLOSED';
  end if;
  if coalesce(btrim(p_authorization_version), '') = ''
    or p_authorization_version <> v_booking.customer_authorization_version then
    raise exception 'AUTHORIZATION_VERSION_REQUIRED';
  end if;
  select pp.stripe_account_id into v_account
  from public.provider_profiles pp where pp.id = v_booking.provider_id;
  if coalesce(btrim(v_account), '') = '' then
    raise exception 'PROVIDER_NOT_PAYOUT_READY';
  end if;
  v_deposit_fee := ((v_booking.upfront_payment_cents::bigint
                     * v_booking.platform_fee_bps + 5000) / 10000)::integer;

  insert into public.booking_payments (
    booking_id, kind, amount_cents, application_fee_cents, currency, status,
    idempotency_key, stripe_connected_account_id,
    customer_authorization_version, authorized_at
  ) values (
    v_booking.id, 'quote_deposit', v_booking.upfront_payment_cents,
    v_deposit_fee, 'usd', 'created', 'qd_' || v_booking.id::text, v_account,
    p_authorization_version, v_now
  )
  on conflict (booking_id, kind) do nothing;

  select bp.* into v_payment from public.booking_payments bp
  where bp.booking_id = v_booking.id and bp.kind = 'quote_deposit';
  return query select v_payment.id, v_payment.idempotency_key,
    v_payment.amount_cents, v_payment.application_fee_cents;
end;
$$;

create or replace function public.attach_quote_deposit_intent(
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
  update public.booking_payments bp
  set stripe_payment_intent_id = p_stripe_payment_intent_id,
      stripe_customer_id = p_stripe_customer_id,
      status = 'processing',
      updated_at = now()
  from public.bookings b
  where bp.booking_id = p_booking_id
    and bp.kind = 'quote_deposit'
    and b.id = bp.booking_id
    and b.customer_id = v_actor
    and b.booking_flow = 'quote_v2'
    and b.status = 'accepted'
    and bp.status in ('created', 'failed', 'cancelled', 'processing');
  if not found then raise exception 'PAYMENT_NOT_ATTACHABLE'; end if;
end;
$$;

create or replace function public.settle_upfront_payment(
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
  v_at timestamptz := coalesce(p_succeeded_at, statement_timestamp());
begin
  select bp.* into v_payment from public.booking_payments bp
  where bp.stripe_payment_intent_id = p_stripe_payment_intent_id
    and bp.kind in ('first_hour', 'quote_deposit');
  if not found then return 'not_found'; end if;
  select b.* into v_booking from public.bookings b
  where b.id = v_payment.booking_id for update;

  if v_booking.status = 'booked' and v_payment.status = 'succeeded' then
    return 'already_booked';
  end if;
  update public.booking_payments
  set status = 'succeeded',
      stripe_payment_method_id =
        coalesce(p_stripe_payment_method_id, stripe_payment_method_id),
      succeeded_at = v_at, updated_at = now()
  where id = v_payment.id and status <> 'succeeded';

  if v_booking.status = 'accepted'
    and (v_payment.kind = 'first_hour'
      or (v_booking.initial_payment_due_at is not null
        and v_at <= v_booking.initial_payment_due_at)) then
    perform set_config('college_crew.trusted_booking_operation', 'on', true);
    update public.bookings
    set status = 'booked', stripe_payment_intent_id = p_stripe_payment_intent_id
    where id = v_booking.id and status = 'accepted';
    return 'booked';
  end if;
  if exists (select 1 from public.booking_refunds r
             where r.payment_id = v_payment.id) then
    return 'already_settled_refund';
  end if;
  return 'refund_owed';
end;
$$;

create or replace function public.mark_upfront_payment_unsuccessful(
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
declare v_payment public.booking_payments%rowtype;
begin
  if p_target_status not in ('failed', 'cancelled', 'requires_action') then
    raise exception 'INVALID_TARGET_STATUS';
  end if;
  select bp.* into v_payment from public.booking_payments bp
  where bp.stripe_payment_intent_id = p_stripe_payment_intent_id
    and bp.kind in ('first_hour', 'quote_deposit');
  if not found then return 'not_found'; end if;
  if v_payment.status = 'succeeded' then return 'already_succeeded'; end if;
  update public.booking_payments
  set status = p_target_status, failure_code = p_failure_code,
      failure_message = p_failure_message,
      action_required_reason = case when p_target_status = 'requires_action'
        then coalesce(p_failure_message, 'authentication_required')
        else action_required_reason end,
      failed_at = case when p_target_status in ('failed', 'cancelled')
        then now() else failed_at end,
      updated_at = now()
  where id = v_payment.id;
  return p_target_status::text;
end;
$$;

-- Existing callers and both webhook implementations keep one settlement name.
create or replace function public.settle_first_hour_payment(
  p_stripe_payment_intent_id text,
  p_stripe_payment_method_id text default null,
  p_succeeded_at timestamptz default null
)
returns text language sql security definer set search_path = ''
as $$ select public.settle_upfront_payment(
  p_stripe_payment_intent_id, p_stripe_payment_method_id, p_succeeded_at
) $$;

create or replace function public.expire_quote_booking_stage(p_booking_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := statement_timestamp();
  v_booking public.bookings%rowtype;
begin
  select b.* into v_booking from public.bookings b
  where b.id = p_booking_id and b.booking_flow = 'quote_v2' for update;
  if not found then raise exception 'BOOKING_NOT_FOUND'; end if;
  if v_booking.status = 'requested' and v_booking.response_alert_at <= v_now then
    perform set_config('college_crew.trusted_booking_operation', 'on', true);
    update public.bookings set status = 'expired', expired_at = v_now
    where id = p_booking_id and status = 'requested';
    return 'response_expired';
  end if;
  if v_booking.status = 'accepted'
    and v_booking.initial_payment_due_at <= v_now then
    perform set_config('college_crew.trusted_booking_operation', 'on', true);
    update public.bookings set status = 'expired', expired_at = v_now
    where id = p_booking_id and status = 'accepted';
    return 'payment_expired';
  end if;
  return 'not_due';
end;
$$;

create or replace function public.expire_failed_hourly_capture(p_booking_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := statement_timestamp();
  v_booking public.bookings%rowtype;
begin
  select b.* into v_booking from public.bookings b
  where b.id = p_booking_id and b.booking_flow = 'hourly_v1' for update;
  if not found then raise exception 'BOOKING_NOT_FOUND'; end if;
  if v_booking.status <> 'accepted' then return 'not_due'; end if;
  if v_booking.accepted_at is null
    or v_booking.accepted_at + interval '15 minutes' > v_now then
    return 'not_due';
  end if;
  if exists (
    select 1 from public.booking_payments bp
    where bp.booking_id = p_booking_id and bp.kind = 'first_hour'
      and bp.status = 'succeeded'
  ) then return 'already_paid'; end if;
  perform set_config('college_crew.trusted_booking_operation', 'on', true);
  update public.bookings set status = 'expired', expired_at = v_now
  where id = p_booking_id and status = 'accepted';
  return 'capture_expired';
end;
$$;

create or replace function private.create_quote_deposit_refund(
  p_booking_id uuid,
  p_key text,
  p_reason text
)
returns boolean language plpgsql security definer set search_path = ''
as $$
declare v_payment public.booking_payments%rowtype;
begin
  select bp.* into v_payment from public.booking_payments bp
  where bp.booking_id = p_booking_id and bp.kind = 'quote_deposit'
    and bp.status = 'succeeded';
  if not found then return false; end if;
  insert into public.booking_refunds (
    booking_id, payment_id, amount_cents, reason, status, idempotency_key,
    reverse_transfer, refund_application_fee
  ) values (
    p_booking_id, v_payment.id, v_payment.amount_cents, p_reason, 'created',
    p_key, v_payment.charge_model = 'destination',
    v_payment.charge_model = 'destination'
  ) on conflict (idempotency_key) do nothing;
  return true;
end;
$$;

create or replace function public.cancel_quote_booking_as_customer(p_booking_id uuid)
returns text language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_now timestamptz := statement_timestamp();
  v_booking public.bookings%rowtype;
  v_paid boolean;
  v_result text;
begin
  select b.* into v_booking from public.bookings b
  where b.id = p_booking_id and b.customer_id = v_actor
    and b.booking_flow = 'quote_v2' for update;
  if not found then raise exception 'BOOKING_NOT_FOUND'; end if;
  if v_booking.arrived_at is not null then raise exception 'BOOKING_ALREADY_ARRIVED'; end if;
  if v_booking.status not in ('requested','accepted','booked') then
    raise exception 'BOOKING_NO_LONGER_CANCELLABLE:%', v_booking.status;
  end if;
  select exists (
    select 1 from public.booking_payments bp
    where bp.booking_id = p_booking_id and bp.kind = 'quote_deposit'
      and bp.status = 'succeeded'
  ) into v_paid;
  if v_booking.status = 'booked' and v_now >= v_booking.scheduled_at then
    raise exception 'USE_NO_SHOW_DISPUTE';
  end if;
  v_result := case
    when not v_paid then 'no_payment'
    when v_booking.scheduled_at - v_now >= interval '12 hours' then 'full_refund'
    else 'no_refund' end;
  perform set_config('college_crew.trusted_booking_operation', 'on', true);
  update public.bookings set status = 'cancelled', cancelled_at = v_now,
    cancelled_by = v_actor, cancelled_by_role = 'customer',
    cancellation_reason = 'customer_cancelled',
    cancellation_policy_result = v_result
  where id = p_booking_id and status = v_booking.status;
  if v_result = 'full_refund' then
    perform private.create_quote_deposit_refund(
      p_booking_id, 'refund_cxl_' || p_booking_id::text,
      'customer_cancellation_full_refund'
    );
  end if;
  return v_result;
end;
$$;

create or replace function public.cancel_quote_booking_as_provider(
  p_booking_id uuid,
  p_reason text
)
returns text language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_now timestamptz := statement_timestamp();
  v_booking public.bookings%rowtype;
  v_refund boolean;
begin
  select b.* into v_booking from public.bookings b
  where b.id = p_booking_id and b.booking_flow = 'quote_v2'
    and public.owns_provider_profile(b.provider_id) for update;
  if not found then raise exception 'BOOKING_NOT_FOUND'; end if;
  if length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'CANCELLATION_REASON_REQUIRED';
  end if;
  if v_booking.arrived_at is not null
    or v_booking.status not in ('accepted','booked') then
    raise exception 'BOOKING_NO_LONGER_CANCELLABLE';
  end if;
  v_refund := private.create_quote_deposit_refund(
    p_booking_id, 'refund_provider_cxl_' || p_booking_id::text,
    'provider_cancellation_full_refund'
  );
  perform set_config('college_crew.trusted_booking_operation', 'on', true);
  update public.bookings set status = 'cancelled', cancelled_at = v_now,
    cancelled_by = v_actor, cancelled_by_role = 'provider',
    cancellation_reason = btrim(p_reason),
    cancellation_policy_result = case when v_refund then 'full_refund'
      else 'no_payment' end
  where id = p_booking_id and status = v_booking.status;
  return case when v_refund then 'full_refund' else 'no_payment' end;
end;
$$;

create or replace function private.queue_hourly_capture_retry()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.booking_flow = 'hourly_v1' and new.status = 'accepted'
    and old.status is distinct from 'accepted' then
    perform private.enqueue_booking_automation_job(
      'capture_upfront_' || new.id::text, 'capture_upfront',
      new.id, new.id, statement_timestamp()
    );
    perform private.enqueue_booking_automation_job(
      'capture_expiration_' || new.id::text, 'capture_expiration',
      new.id, new.id, statement_timestamp() + interval '15 minutes'
    );
  end if;
  return new;
end;
$$;

drop trigger if exists queue_hourly_capture_retry on public.bookings;
create trigger queue_hourly_capture_retry
  after update of status on public.bookings
  for each row execute function private.queue_hourly_capture_retry();

-- ---------------------------------------------------------------------------
-- Shared post-job invoice and payout rails
-- ---------------------------------------------------------------------------

create or replace function public.submit_quote_invoice(p_booking_id uuid)
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
  v_id uuid;
begin
  select b.* into v_booking from public.bookings b
  where b.id = p_booking_id for update;
  if not found then raise exception 'BOOKING_NOT_FOUND'; end if;
  if not public.owns_provider_profile(v_booking.provider_id) then
    raise exception 'NOT_AUTHORIZED';
  end if;
  if v_booking.booking_flow <> 'quote_v2' then
    raise exception 'NOT_QUOTE_BOOKING';
  end if;
  select bi.id into v_existing from public.booking_invoices bi
  where bi.booking_id = p_booking_id;
  if v_existing is not null then return v_existing; end if;
  if v_booking.status <> 'in_progress' then
    raise exception 'BOOKING_NOT_IN_PROGRESS:%', v_booking.status;
  end if;

  perform set_config('college_crew.trusted_booking_operation', 'on', true);
  update public.bookings set status = 'invoice_review', work_completed_at = v_now
  where id = p_booking_id and status = 'in_progress';
  insert into public.booking_invoices (
    booking_id, billing_basis, submitted_minutes, estimated_minutes_snapshot,
    hourly_rate_cents_snapshot, quote_total_cents_snapshot,
    platform_fee_bps_snapshot, provider_explanation, subtotal_cents,
    total_platform_fee_cents, first_hour_credit_cents,
    remaining_balance_cents, status, submitted_at, autocharge_at
  ) values (
    p_booking_id, 'fixed_quote', null, null,
    null, v_booking.price_cents, v_booking.platform_fee_bps, '',
    v_booking.price_cents, v_booking.platform_fee_cents,
    v_booking.upfront_payment_cents,
    v_booking.price_cents - v_booking.upfront_payment_cents,
    'review', v_now, v_now + interval '24 hours'
  ) returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.settle_quote_job_in_cash(
  p_booking_id uuid,
  p_confirmed boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := statement_timestamp();
  v_booking public.bookings%rowtype;
  v_existing uuid;
  v_id uuid;
begin
  if not coalesce(p_confirmed, false) then
    raise exception 'CASH_CONFIRMATION_REQUIRED';
  end if;
  select b.* into v_booking from public.bookings b
  where b.id = p_booking_id and b.booking_flow = 'quote_v2' for update;
  if not found then raise exception 'BOOKING_NOT_FOUND'; end if;
  if not public.owns_provider_profile(v_booking.provider_id) then
    raise exception 'NOT_AUTHORIZED';
  end if;
  select bi.id into v_existing from public.booking_invoices bi
  where bi.booking_id = p_booking_id;
  if v_existing is not null then return v_existing; end if;
  if v_booking.status <> 'in_progress' then
    raise exception 'BOOKING_NOT_IN_PROGRESS:%', v_booking.status;
  end if;
  perform set_config('college_crew.trusted_booking_operation', 'on', true);
  update public.bookings set status = 'invoice_review', work_completed_at = v_now
  where id = p_booking_id and status = 'in_progress';
  insert into public.booking_invoices (
    booking_id, billing_basis, submitted_minutes, estimated_minutes_snapshot,
    hourly_rate_cents_snapshot, quote_total_cents_snapshot,
    platform_fee_bps_snapshot, provider_explanation, subtotal_cents,
    total_platform_fee_cents, first_hour_credit_cents,
    remaining_balance_cents, status, submitted_at, autocharge_at
  ) values (
    p_booking_id, 'fixed_quote', null, null,
    null, v_booking.price_cents, v_booking.platform_fee_bps, '',
    v_booking.price_cents, v_booking.platform_fee_cents,
    v_booking.upfront_payment_cents,
    v_booking.price_cents - v_booking.upfront_payment_cents,
    'cash_settled', v_now, null
  ) returning id into v_id;
  update public.bookings set status = 'completed', cash_settled_at = v_now
  where id = p_booking_id and status = 'invoice_review';
  return v_id;
end;
$$;

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

create or replace function public.mark_booking_arrived(p_booking_id uuid)
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
  select b.* into v_booking from public.bookings b
  where b.id = p_booking_id for update;
  if not found then raise exception 'BOOKING_NOT_FOUND'; end if;
  if not public.owns_provider_profile(v_booking.provider_id) then
    raise exception 'NOT_AUTHORIZED';
  end if;
  if v_booking.booking_flow not in ('hourly_v1', 'quote_v2') then
    raise exception 'UNSUPPORTED_BOOKING_FLOW';
  end if;
  if v_booking.status = 'in_progress' then return 'in_progress'; end if;
  if v_booking.status <> 'booked' then
    raise exception 'BOOKING_NOT_BOOKED:%', v_booking.status;
  end if;
  if v_now < v_booking.scheduled_at - interval '30 minutes' then
    raise exception 'ARRIVAL_TOO_EARLY';
  end if;
  perform set_config('college_crew.trusted_booking_operation', 'on', true);
  update public.bookings set status = 'in_progress', arrived_at = v_now
  where id = p_booking_id and status = 'booked';
  perform private.enqueue_booking_automation_job(
    'completion_timeout_' || p_booking_id::text,
    'completion_timeout', p_booking_id, p_booking_id, v_now + interval '24 hours'
  );
  return 'in_progress';
end;
$$;

create or replace function public.mark_booking_en_route(p_booking_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := statement_timestamp();
  v_booking public.bookings%rowtype;
begin
  select b.* into v_booking from public.bookings b
  where b.id = p_booking_id for update;
  if not found then raise exception 'BOOKING_NOT_FOUND'; end if;
  if not public.owns_provider_profile(v_booking.provider_id) then
    raise exception 'NOT_AUTHORIZED';
  end if;
  if v_booking.booking_flow not in ('hourly_v1', 'quote_v2') then
    raise exception 'UNSUPPORTED_BOOKING_FLOW';
  end if;
  if v_booking.status <> 'booked' then
    raise exception 'BOOKING_NOT_BOOKED:%', v_booking.status;
  end if;
  if v_booking.en_route_at is not null then return v_booking.en_route_at; end if;
  if v_now < v_booking.scheduled_at - interval '2 hours' then
    raise exception 'EN_ROUTE_TOO_EARLY';
  end if;
  update public.bookings set en_route_at = v_now
  where id = p_booking_id and status = 'booked' and en_route_at is null;
  return v_now;
end;
$$;

create or replace function private.queue_booking_en_route_email()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.booking_flow in ('hourly_v1', 'quote_v2')
    and new.en_route_at is not null and old.en_route_at is null then
    perform private.enqueue_participant_email(
      'en_route_customer_' || new.id::text, new.id, 'customer',
      'provider_en_route',
      jsonb_build_object('booking_id', new.id, 'en_route_at', new.en_route_at)
    );
  end if;
  return new;
end;
$$;

create or replace function public.auto_complete_quote_job(p_booking_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := statement_timestamp();
  v_booking public.bookings%rowtype;
  v_existing uuid;
  v_id uuid;
begin
  select b.* into v_booking from public.bookings b
  where b.id = p_booking_id and b.booking_flow = 'quote_v2' for update;
  if not found then return null; end if;
  select bi.id into v_existing from public.booking_invoices bi
  where bi.booking_id = p_booking_id;
  if v_existing is not null then return v_existing; end if;
  if v_booking.status <> 'in_progress' then return null; end if;
  if v_booking.arrived_at is null
    or v_booking.arrived_at > v_now - interval '24 hours' then
    raise exception 'COMPLETION_NOT_DUE';
  end if;
  perform set_config('college_crew.trusted_booking_operation', 'on', true);
  update public.bookings set status = 'invoice_review', work_completed_at = v_now
  where id = p_booking_id and status = 'in_progress';
  insert into public.booking_invoices (
    booking_id, billing_basis, submitted_minutes, estimated_minutes_snapshot,
    hourly_rate_cents_snapshot, quote_total_cents_snapshot,
    platform_fee_bps_snapshot, provider_explanation, subtotal_cents,
    total_platform_fee_cents, first_hour_credit_cents,
    remaining_balance_cents, status, submitted_at, autocharge_at
  ) values (
    p_booking_id, 'fixed_quote', null, null,
    null, v_booking.price_cents, v_booking.platform_fee_bps, '',
    v_booking.price_cents, v_booking.platform_fee_cents,
    v_booking.upfront_payment_cents,
    v_booking.price_cents - v_booking.upfront_payment_cents,
    'review', v_now, v_now + interval '24 hours'
  ) returning id into v_id;
  return v_id;
end;
$$;

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
set search_path = ''
as $$
declare
  v_booking public.bookings%rowtype;
  v_rake integer;
begin
  select b.* into v_booking from public.bookings b
  where b.id = p_booking_id
    and b.booking_flow in ('hourly_v1', 'quote_v2');
  if not found then raise exception 'BOOKING_NOT_FOUND'; end if;

  if v_booking.status = 'cancelled'
    and v_booking.cancellation_policy_result = 'no_refund' then
    select bp.application_fee_cents into v_rake
    from public.booking_payments bp where bp.booking_id = p_booking_id
      and bp.kind in ('first_hour', 'quote_deposit') and bp.status = 'succeeded';
  else
    select bi.total_platform_fee_cents into v_rake
    from public.booking_invoices bi where bi.booking_id = p_booking_id;
  end if;
  if v_rake is null then return; end if;

  return query
  select bp.id, bp.kind, bp.stripe_payment_intent_id,
         bp.stripe_connected_account_id,
         (case when bp.kind in ('first_hour', 'quote_deposit')
           then greatest(0, bp.amount_cents - v_rake)
           else bp.amount_cents end)::integer
  from public.booking_payments bp
  where bp.booking_id = p_booking_id
    and bp.status = 'succeeded'
    and bp.charge_model = 'platform'
    and bp.stripe_payment_intent_id is not null
    and (case when bp.kind in ('first_hour', 'quote_deposit')
      then greatest(0, bp.amount_cents - v_rake)
      else bp.amount_cents end) > 0;
end;
$$;

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
  return v_id;
end;
$$;

create or replace function public.resolve_quote_booking_dispute(
  p_booking_id uuid,
  p_resolution_kind public.booking_dispute_resolution,
  p_audit_note text
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
  v_booking public.bookings%rowtype;
  v_dispute public.booking_disputes%rowtype;
  v_invoice public.booking_invoices%rowtype;
  v_upfront public.booking_payments%rowtype;
  v_balance public.booking_payments%rowtype;
  v_fee integer;
  v_outcome text := 'resolved';
  v_refund_payment uuid;
  v_refund_amount integer;
  v_refund_key text;
begin
  if v_actor is null or not public.is_admin() then raise exception 'NOT_AUTHORIZED'; end if;
  if length(btrim(coalesce(p_audit_note, ''))) < 1 then
    raise exception 'AUDIT_NOTE_REQUIRED';
  end if;
  if p_resolution_kind = 'reduce_billable_minutes' then
    raise exception 'FIXED_QUOTE_CANNOT_REDUCE_MINUTES';
  end if;
  select b.* into v_booking from public.bookings b
  where b.id = p_booking_id and b.booking_flow = 'quote_v2' for update;
  if not found then raise exception 'BOOKING_NOT_FOUND'; end if;
  select d.* into v_dispute from public.booking_disputes d
  where d.booking_id = p_booking_id for update;
  if not found or v_dispute.status <> 'open' then
    raise exception 'DISPUTE_NOT_OPEN';
  end if;
  select bi.* into v_invoice from public.booking_invoices bi
  where bi.booking_id = p_booking_id;
  select bp.* into v_upfront from public.booking_payments bp
  where bp.booking_id = p_booking_id and bp.kind = 'quote_deposit';
  select bp.* into v_balance from public.booking_payments bp
  where bp.booking_id = p_booking_id and bp.kind = 'balance';

  if p_resolution_kind = 'waive_remaining_balance' then
    if v_invoice.id is null then raise exception 'INVOICE_REQUIRED'; end if;
    update public.booking_invoices set status = 'waived', resolved_at = v_now,
      autocharge_at = null, updated_at = now() where id = v_invoice.id;
    if v_booking.status = 'disputed' then
      perform set_config('college_crew.trusted_booking_operation', 'on', true);
      update public.bookings set status = 'completed'
      where id = p_booking_id and status = 'disputed';
    end if;
  elsif p_resolution_kind = 'cancel_and_refund' then
    if v_balance.id is not null and v_balance.status = 'succeeded' then
      v_refund_key := 'refund_admin_bal_' || p_booking_id::text;
      insert into public.booking_refunds (
        booking_id, payment_id, amount_cents, reason, status, idempotency_key,
        reverse_transfer, refund_application_fee
      ) values (
        p_booking_id, v_balance.id, v_balance.amount_cents,
        'dispute_cancel_refund', 'created', v_refund_key, false, false
      ) on conflict (idempotency_key) do nothing;
      v_outcome := 'refund_required';
      v_refund_payment := v_balance.id;
      v_refund_amount := v_balance.amount_cents;
    end if;
    if v_upfront.id is not null and v_upfront.status = 'succeeded' then
      v_refund_key := 'refund_admin_qd_' || p_booking_id::text;
      insert into public.booking_refunds (
        booking_id, payment_id, amount_cents, reason, status, idempotency_key,
        reverse_transfer, refund_application_fee
      ) values (
        p_booking_id, v_upfront.id, v_upfront.amount_cents,
        'dispute_cancel_refund', 'created', v_refund_key, false, false
      ) on conflict (idempotency_key) do nothing;
      v_outcome := 'refund_required';
      v_refund_payment := coalesce(v_refund_payment, v_upfront.id);
      v_refund_amount := coalesce(v_refund_amount, v_upfront.amount_cents);
    end if;
    if v_booking.status = 'disputed' then
      perform set_config('college_crew.trusted_booking_operation', 'on', true);
      update public.bookings set status = 'cancelled', cancelled_at = v_now,
        cancelled_by = v_actor, cancelled_by_role = 'admin',
        cancellation_reason = 'dispute_cancel_refund',
        cancellation_policy_result = 'full_refund'
      where id = p_booking_id and status = 'disputed';
    end if;
  elsif p_resolution_kind = 'approve_submitted_hours' then
    if v_invoice.id is null then raise exception 'INVOICE_REQUIRED'; end if;
    if v_invoice.status not in ('paid','waived')
      and v_invoice.remaining_balance_cents > 0 then
      v_fee := greatest(
        0, v_invoice.total_platform_fee_cents - v_upfront.application_fee_cents
      );
      insert into public.booking_payments (
        booking_id, invoice_id, kind, amount_cents, application_fee_cents,
        currency, status, idempotency_key, stripe_connected_account_id,
        customer_authorization_version, authorized_at
      ) values (
        p_booking_id, v_invoice.id, 'balance',
        v_invoice.remaining_balance_cents, v_fee, 'usd', 'created',
        'bal_' || p_booking_id::text || '_0',
        v_upfront.stripe_connected_account_id,
        v_upfront.customer_authorization_version, v_now
      ) on conflict (booking_id, kind) do update
        set amount_cents = excluded.amount_cents,
            application_fee_cents = excluded.application_fee_cents,
            status = 'created', stripe_payment_intent_id = null,
            updated_at = now();
      select bp.* into v_balance from public.booking_payments bp
      where bp.booking_id = p_booking_id and bp.kind = 'balance';
      v_outcome := 'charge_required';
    elsif v_booking.status = 'disputed' then
      perform set_config('college_crew.trusted_booking_operation', 'on', true);
      update public.bookings set status = 'completed'
      where id = p_booking_id and status = 'disputed';
    end if;
  end if;
  update public.booking_disputes set status = 'resolved',
    resolution_kind = p_resolution_kind, resolver_id = v_actor,
    resolved_at = v_now, audit_note = btrim(p_audit_note)
  where id = v_dispute.id;
  return query select v_outcome, v_invoice.id, v_balance.id,
    case when v_outcome = 'charge_required' then v_balance.amount_cents end,
    case when v_outcome = 'charge_required' then v_balance.application_fee_cents end,
    case when v_outcome = 'charge_required' then v_balance.idempotency_key end,
    v_refund_payment, v_refund_amount, v_refund_key;
end;
$$;

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
      new.id, new.id, statement_timestamp()
    );
  end if;
  return new;
end;
$$;

create or replace function private.queue_quote_v2_email()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.booking_flow <> 'quote_v2' then return new; end if;
  if tg_op = 'INSERT' then
    perform private.enqueue_participant_email(
      'quote_request_new_' || new.id::text, new.id, 'provider',
      'new_provider_request', jsonb_build_object('booking_id', new.id)
    );
    return new;
  end if;
  if new.status is not distinct from old.status then return new; end if;
  if new.status = 'accepted' then
    perform private.enqueue_participant_email(
      'quote_sent_' || new.id::text, new.id, 'customer',
      'quote_deposit_due',
      jsonb_build_object('booking_id', new.id)
    );
  elsif new.status = 'booked' then
    perform private.enqueue_participant_email(
      'quote_booked_customer_' || new.id::text, new.id, 'customer',
      'quote_deposit_receipt', jsonb_build_object('booking_id', new.id)
    );
    perform private.enqueue_participant_email(
      'quote_booked_provider_' || new.id::text, new.id, 'provider',
      'quote_deposit_booked_job', jsonb_build_object('booking_id', new.id)
    );
  elsif new.status in ('declined', 'expired') then
    perform private.enqueue_participant_email(
      'quote_replacement_' || new.id::text, new.id, 'customer',
      case when new.status = 'declined' then 'request_declined'
        else 'request_start_expired' end,
      jsonb_build_object('booking_id', new.id)
    );
  elsif new.status = 'withdrawn' then
    perform private.enqueue_participant_email(
      'quote_withdrawn_' || new.id::text, new.id, 'provider',
      'request_withdrawn', jsonb_build_object('booking_id', new.id)
    );
  elsif new.status = 'in_progress' then
    perform private.enqueue_participant_email(
      'quote_arrived_' || new.id::text, new.id, 'customer',
      'provider_arrived', jsonb_build_object('booking_id', new.id)
    );
  elsif new.status = 'cancelled' then
    perform private.enqueue_participant_email(
      'quote_cancel_customer_' || new.id::text, new.id, 'customer',
      'booking_cancelled_customer', jsonb_build_object('booking_id', new.id)
    );
    perform private.enqueue_participant_email(
      'quote_cancel_provider_' || new.id::text, new.id, 'provider',
      'booking_cancelled_provider', jsonb_build_object('booking_id', new.id)
    );
  elsif new.status = 'completed' then
    perform private.enqueue_participant_email(
      'quote_complete_customer_' || new.id::text, new.id, 'customer',
      'final_payment_success', jsonb_build_object('booking_id', new.id)
    );
    perform private.enqueue_participant_email(
      'quote_complete_provider_' || new.id::text, new.id, 'provider',
      'job_completed_paid', jsonb_build_object('booking_id', new.id)
    );
  end if;
  return new;
end;
$$;

drop trigger if exists quote_v2_email on public.bookings;
create trigger quote_v2_email
  after insert or update of status on public.bookings
  for each row execute function private.queue_quote_v2_email();

-- Quote v2 and hourly share the trusted transition graph after the quote is
-- sent; quote_v1 remains on the old full-price graph for legacy readability.
create or replace function public.enforce_booking_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  trusted_operation boolean :=
    coalesce(current_setting('college_crew.trusted_booking_operation', true), '') = 'on';
begin
  if new.status = old.status then return new; end if;
  if old.booking_flow in ('legacy', 'quote_v1') then
    if not (
      (old.status = 'requested' and new.status in ('accepted','declined','cancelled'))
      or (old.status = 'accepted' and new.status in ('paid','cancelled'))
      or (old.status = 'paid' and new.status = 'completed')
    ) then raise exception 'illegal full-price booking transition'; end if;
    return new;
  end if;
  if (select auth.uid()) is not null and not trusted_operation then
    raise exception 'booking transitions require a trusted operation';
  end if;
  if not (
    (old.status = 'requested' and new.status in
      ('accepted','declined','withdrawn','expired','cancelled','countered'))
    or (old.status = 'countered' and new.status in
      ('accepted','declined','withdrawn','expired','cancelled'))
    or (old.status = 'accepted' and new.status in ('booked','expired','cancelled'))
    or (old.status = 'booked' and new.status in ('in_progress','disputed','cancelled'))
    or (old.status = 'in_progress' and new.status in ('invoice_review','disputed'))
    or (old.status = 'invoice_review' and new.status in ('completed','disputed'))
    or (old.status = 'disputed' and new.status in ('completed','cancelled'))
  ) then raise exception 'illegal booking transition: % -> %', old.status, new.status;
  end if;
  return new;
end;
$$;

create or replace function private.enforce_quote_booking_immutability()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  trusted_operation boolean :=
    coalesce(current_setting('college_crew.trusted_booking_operation', true), '') = 'on';
begin
  if new.average_quote_cents_snapshot is distinct from old.average_quote_cents_snapshot
    then raise exception 'average quote snapshot is immutable'; end if;
  if old.booking_flow = 'quote_v2' and old.quote_sent_at is null
    and (
      new.scheduled_at is distinct from old.scheduled_at
      or new.estimated_minutes is distinct from old.estimated_minutes
      or new.requested_local_date is distinct from old.requested_local_date
      or new.requested_daypart is distinct from old.requested_daypart
    )
    and not trusted_operation then
    raise exception 'quote schedule changes require a trusted operation';
  end if;
  if old.booking_flow in ('quote_v1', 'quote_v2') and old.quote_sent_at is not null
    and (
      new.quote_sent_at is distinct from old.quote_sent_at
      or new.price_cents is distinct from old.price_cents
      or new.platform_fee_cents is distinct from old.platform_fee_cents
      or new.deposit_bps is distinct from old.deposit_bps
      or new.upfront_payment_cents is distinct from old.upfront_payment_cents
    ) then raise exception 'final quote is immutable'; end if;
  return new;
end;
$$;

revoke all on function public.begin_quote_deposit(uuid, text),
  public.attach_quote_deposit_intent(uuid, text, text) from public, anon;
grant execute on function public.begin_quote_deposit(uuid, text),
  public.attach_quote_deposit_intent(uuid, text, text) to authenticated;
revoke all on function public.settle_upfront_payment(text, text, timestamptz),
  public.mark_upfront_payment_unsuccessful(
    text, public.booking_payment_status, text, text),
  public.expire_quote_booking_stage(uuid),
  public.expire_failed_hourly_capture(uuid),
  public.auto_complete_quote_job(uuid),
  public.provider_payout_plan(uuid)
  from public, anon, authenticated;
grant execute on function public.settle_upfront_payment(text, text, timestamptz),
  public.mark_upfront_payment_unsuccessful(
    text, public.booking_payment_status, text, text),
  public.expire_quote_booking_stage(uuid),
  public.expire_failed_hourly_capture(uuid),
  public.auto_complete_quote_job(uuid),
  public.provider_payout_plan(uuid)
  to service_role;
revoke all on function public.submit_quote_invoice(uuid) from public, anon;
grant execute on function public.submit_quote_invoice(uuid) to authenticated;
revoke all on function public.settle_quote_job_in_cash(uuid, boolean)
  from public, anon;
grant execute on function public.settle_quote_job_in_cash(uuid, boolean)
  to authenticated;
revoke all on function public.cancel_quote_booking_as_customer(uuid),
  public.cancel_quote_booking_as_provider(uuid, text) from public, anon;
grant execute on function public.cancel_quote_booking_as_customer(uuid),
  public.cancel_quote_booking_as_provider(uuid, text) to authenticated;
revoke all on function public.replace_quote_booking_request(uuid, uuid, timestamptz)
  from public, anon;
grant execute on function public.replace_quote_booking_request(uuid, uuid, timestamptz)
  to authenticated;
revoke all on function public.resolve_quote_booking_dispute(
  uuid, public.booking_dispute_resolution, text
) from public, anon;
grant execute on function public.resolve_quote_booking_dispute(
  uuid, public.booking_dispute_resolution, text
) to authenticated;
revoke all on function public.claim_expired_booking_drafts(integer, integer),
  public.complete_booking_draft_cleanup(uuid, uuid),
  public.retry_booking_draft_cleanup(uuid, uuid, text, integer, boolean)
  from public, anon, authenticated;
grant execute on function public.claim_expired_booking_drafts(integer, integer),
  public.complete_booking_draft_cleanup(uuid, uuid),
  public.retry_booking_draft_cleanup(uuid, uuid, text, integer, boolean)
  to service_role;

-- ---------------------------------------------------------------------------
-- Quote daypart negotiation
-- ---------------------------------------------------------------------------

create table public.booking_quote_counter_options (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  round_number smallint not null check (round_number > 0),
  ordinal smallint not null check (ordinal between 1 and 3),
  local_date date not null,
  daypart public.quote_daypart not null,
  offered_at timestamptz not null default now(),
  expires_at timestamptz not null,
  selected_at timestamptz,
  unique (booking_id, round_number, ordinal),
  unique (booking_id, round_number, local_date)
);

create index booking_quote_counter_options_active_idx
  on public.booking_quote_counter_options (booking_id, round_number, expires_at);

alter table public.booking_quote_counter_options enable row level security;
create policy "Quote participants and admins read counter options"
  on public.booking_quote_counter_options for select
  to authenticated
  using (
    exists (
      select 1 from public.bookings b
      where b.id = booking_id
        and (
          b.customer_id = (select auth.uid())
          or public.owns_provider_profile(b.provider_id)
          or public.is_admin()
        )
    )
  );
grant select on public.booking_quote_counter_options to authenticated;

create table public.booking_quote_provider_estimates (
  booking_id uuid primary key references public.bookings(id) on delete cascade,
  estimated_minutes integer not null check (
    estimated_minutes between 60 and 720 and estimated_minutes % 15 = 0
  ),
  updated_at timestamptz not null default now()
);

alter table public.booking_quote_provider_estimates enable row level security;
create policy "Assigned providers and admins read quote estimates"
  on public.booking_quote_provider_estimates for select
  to authenticated
  using (
    exists (
      select 1 from public.bookings b
      where b.id = booking_id
        and (public.owns_provider_profile(b.provider_id) or public.is_admin())
    )
  );
grant select on public.booking_quote_provider_estimates to authenticated;

create or replace function private.provider_has_reserved_slot_conflict(
  p_provider_id uuid,
  p_scheduled_at timestamptz,
  p_estimated_minutes integer,
  p_exclude_booking_id uuid default null
)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.bookings b
    left join public.booking_quote_provider_estimates qe
      on qe.booking_id = b.id and b.booking_flow = 'quote_v2'
    where b.provider_id = p_provider_id
      and b.status in (
        'accepted', 'paid', 'booked', 'in_progress', 'invoice_review', 'disputed'
      )
      and (p_exclude_booking_id is null or b.id <> p_exclude_booking_id)
      and b.scheduled_at < p_scheduled_at + make_interval(mins => p_estimated_minutes)
      and b.scheduled_at + make_interval(
        mins => coalesce(qe.estimated_minutes, b.estimated_minutes, 60)
      ) > p_scheduled_at
  )
$$;

create or replace function public.provider_busy_intervals(
  p_provider_id uuid,
  p_from timestamptz,
  p_to timestamptz
)
returns table (start_at timestamptz, end_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_from is null or p_to is null or p_to < p_from then
    raise exception 'INVALID_DATE_RANGE';
  end if;
  if p_to - p_from > interval '400 days' then
    raise exception 'DATE_RANGE_TOO_WIDE';
  end if;
  if not (
    public.is_provider_approved(p_provider_id)
    or public.owns_provider_profile(p_provider_id)
    or public.is_admin()
  ) then return; end if;

  return query
  select b.scheduled_at,
    b.scheduled_at + make_interval(
      mins => coalesce(qe.estimated_minutes, b.estimated_minutes, 60)
    )
  from public.bookings b
  left join public.booking_quote_provider_estimates qe
    on qe.booking_id = b.id and b.booking_flow = 'quote_v2'
  where b.provider_id = p_provider_id
    and b.status in (
      'accepted', 'paid', 'booked', 'in_progress', 'invoice_review', 'disputed'
    )
    and b.scheduled_at < p_to
    and b.scheduled_at + make_interval(
      mins => coalesce(qe.estimated_minutes, b.estimated_minutes, 60)
    ) > p_from
  order by b.scheduled_at;
end;
$$;

create or replace function private.enforce_quote_provider_estimate_immutability()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_booking_id uuid := coalesce(new.booking_id, old.booking_id);
begin
  if exists (
    select 1 from public.bookings b
    where b.id = v_booking_id and b.quote_sent_at is not null
  ) then raise exception 'final quote duration is immutable'; end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger quote_provider_estimate_immutable
  before insert or update or delete on public.booking_quote_provider_estimates
  for each row execute function private.enforce_quote_provider_estimate_immutability();

revoke all on function private.provider_has_reserved_slot_conflict(
  uuid, timestamptz, integer, uuid
), private.enforce_quote_provider_estimate_immutability()
from public, anon, authenticated, service_role;

create or replace function private.quote_daypart_start(
  p_local_date date,
  p_daypart public.quote_daypart
)
returns timestamp
language sql
immutable
set search_path = ''
as $$
  select p_local_date::timestamp
    + case when p_daypart = 'afternoon' then time '12:00'
      else time '08:00' end
$$;

create or replace function private.quote_daypart_end(
  p_local_date date,
  p_daypart public.quote_daypart
)
returns timestamp
language sql
immutable
set search_path = ''
as $$
  select p_local_date::timestamp
    + case when p_daypart = 'morning' then time '11:45'
      else time '17:00' end
$$;

create or replace function private.first_quote_daypart_slot(
  p_provider_id uuid,
  p_local_date date,
  p_daypart public.quote_daypart,
  p_estimated_minutes integer,
  p_not_before timestamptz,
  p_exclude_booking_id uuid default null
)
returns timestamptz
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_candidate_local timestamp;
  v_candidate timestamptz;
  v_end_local timestamp;
begin
  if p_estimated_minutes not between 60 and 720
    or p_estimated_minutes % 15 <> 0 then
    raise exception 'INVALID_DURATION';
  end if;
  for v_candidate_local in
    select generate_series(
      private.quote_daypart_start(p_local_date, p_daypart),
      private.quote_daypart_end(p_local_date, p_daypart),
      interval '15 minutes'
    )
  loop
    v_candidate := v_candidate_local at time zone 'America/Chicago';
    v_end_local := v_candidate_local + make_interval(mins => p_estimated_minutes);
    if v_candidate >= p_not_before
      and v_end_local::date = p_local_date
      and exists (
        select 1
        from private.provider_effective_window(p_provider_id, p_local_date) ew
        where v_candidate_local::time >= ew.start_local
          and v_end_local::time <= ew.end_local
      )
      and not private.provider_has_reserved_slot_conflict(
        p_provider_id, v_candidate, p_estimated_minutes, p_exclude_booking_id
      ) then
      return v_candidate;
    end if;
  end loop;
  return null;
end;
$$;

revoke all on function private.quote_daypart_start(date, public.quote_daypart),
  private.quote_daypart_end(date, public.quote_daypart),
  private.first_quote_daypart_slot(
    uuid, date, public.quote_daypart, integer, timestamptz, uuid
  ) from public, anon, authenticated, service_role;

-- The old exact-time signature remains only as an internal hardened constructor:
-- it performs photo/storage/address/legal/offering checks before this wrapper
-- clears the provisional slot and stores the customer's real date/daypart.
create or replace function public.create_quote_deposit_booking_request(
  p_provider_service_id uuid,
  p_requested_local_date date,
  p_requested_daypart public.quote_daypart,
  p_address text,
  p_job_zip text,
  p_job_photos jsonb,
  p_details text default '',
  p_address_kind text default 'home',
  p_service_city text default '',
  p_latitude double precision default null,
  p_longitude double precision default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := statement_timestamp();
  v_provider_id uuid;
  v_slot timestamptz;
  v_id uuid;
begin
  select ps.provider_id into v_provider_id
  from public.provider_services ps
  where ps.id = p_provider_service_id;
  if v_provider_id is null then raise exception 'OFFERING_NOT_BOOKABLE'; end if;

  v_slot := private.first_quote_daypart_slot(
    v_provider_id, p_requested_local_date, p_requested_daypart,
    60, v_now + interval '12 hours', null
  );
  if v_slot is null then raise exception 'QUOTE_DAYPART_UNAVAILABLE'; end if;

  v_id := public.create_quote_deposit_booking_request(
    p_provider_service_id, v_slot, 60, p_address, p_job_zip, p_job_photos,
    p_details, p_address_kind, p_service_city, p_latitude, p_longitude
  );

  perform set_config('college_crew.trusted_booking_operation', 'on', true);
  update public.bookings
  set requested_local_date = p_requested_local_date,
      requested_daypart = p_requested_daypart,
      scheduled_at = null,
      estimated_minutes = null,
      quote_negotiation_round = 0,
      policy_snapshot = policy_snapshot || jsonb_build_object(
        'requested_local_date', p_requested_local_date,
        'requested_daypart', p_requested_daypart,
        'daypart_timezone', 'America/Chicago'
      )
  where id = v_id and booking_flow = 'quote_v2';
  return v_id;
end;
$$;

revoke all on function public.create_quote_deposit_booking_request(
  uuid, date, public.quote_daypart, text, text, jsonb, text, text, text,
  double precision, double precision
) from public, anon;
grant execute on function public.create_quote_deposit_booking_request(
  uuid, date, public.quote_daypart, text, text, jsonb, text, text, text,
  double precision, double precision
) to authenticated;
revoke all on function public.create_quote_deposit_booking_request(
  uuid, timestamptz, integer, text, text, jsonb, text, text, text,
  double precision, double precision
) from public, anon, authenticated;

create or replace function public.replace_quote_booking_request(
  p_original_booking_id uuid,
  p_provider_service_id uuid,
  p_requested_local_date date,
  p_requested_daypart public.quote_daypart
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_original public.bookings%rowtype;
  v_new uuid;
begin
  select b.* into v_original from public.bookings b
  where b.id = p_original_booking_id and b.customer_id = v_actor
    and b.booking_flow = 'quote_v2' for update;
  if not found then raise exception 'BOOKING_NOT_FOUND'; end if;
  if not (
    v_original.status in ('declined', 'expired', 'withdrawn')
    or (v_original.status = 'cancelled'
      and v_original.cancelled_by_role = 'provider')
  ) then raise exception 'REPLACEMENT_NOT_AVAILABLE_YET'; end if;
  if not exists (
    select 1 from public.provider_services ps
    where ps.id = p_provider_service_id
      and ps.service_id = v_original.service_id
      and ps.provider_id <> v_original.provider_id
      and public.is_provider_offering_quote_bookable(ps.id)
  ) then raise exception 'OFFERING_NOT_BOOKABLE'; end if;

  v_new := public.create_quote_deposit_booking_request(
    p_provider_service_id, p_requested_local_date, p_requested_daypart,
    v_original.address, v_original.job_zip, v_original.job_photos,
    v_original.details, v_original.address_kind, v_original.service_city,
    v_original.latitude, v_original.longitude
  );
  update public.bookings set replacement_for_booking_id = v_original.id
  where id = v_new;
  update public.bookings set replaced_by_booking_id = v_new
  where id = v_original.id;
  return v_new;
end;
$$;

revoke all on function public.replace_quote_booking_request(
  uuid, uuid, date, public.quote_daypart
) from public, anon;
grant execute on function public.replace_quote_booking_request(
  uuid, uuid, date, public.quote_daypart
) to authenticated;
revoke all on function public.replace_quote_booking_request(
  uuid, uuid, timestamptz
) from public, anon, authenticated;

create or replace function public.counter_quote_booking_request(
  p_booking_id uuid,
  p_estimated_minutes integer,
  p_options jsonb,
  p_note text default ''
)
returns smallint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := statement_timestamp();
  v_booking public.bookings%rowtype;
  v_count integer;
  v_round smallint;
  v_option jsonb;
  v_date date;
  v_daypart public.quote_daypart;
  v_earliest timestamp;
  v_due timestamptz;
  v_ordinal integer := 0;
begin
  select b.* into v_booking
  from public.bookings b
  where b.id = p_booking_id and b.booking_flow = 'quote_v2'
    and public.owns_provider_profile(b.provider_id)
  for update;
  if not found then raise exception 'BOOKING_NOT_FOUND'; end if;
  if v_booking.status <> 'requested' then
    raise exception 'REQUEST_NO_LONGER_OPEN:%', v_booking.status;
  end if;
  if v_booking.response_alert_at is null or v_booking.response_alert_at <= v_now then
    raise exception 'REQUEST_EXPIRED';
  end if;
  if p_estimated_minutes not between 60 and 720
    or p_estimated_minutes % 15 <> 0 then raise exception 'INVALID_DURATION'; end if;
  if char_length(btrim(coalesce(p_note, ''))) > 500 then
    raise exception 'COUNTER_NOTE_TOO_LONG';
  end if;
  if p_options is null or jsonb_typeof(p_options) <> 'array' then
    raise exception 'INVALID_COUNTER_OPTIONS';
  end if;
  v_count := jsonb_array_length(p_options);
  if v_count not between 1 and 3 then raise exception 'INVALID_COUNTER_OPTIONS'; end if;

  create temporary table if not exists pg_temp.valid_quote_options (
    ordinal integer, local_date date, daypart public.quote_daypart
  ) on commit drop;
  truncate pg_temp.valid_quote_options;

  for v_option in select value from jsonb_array_elements(p_options)
  loop
    v_ordinal := v_ordinal + 1;
    begin
      v_date := (v_option->>'localDate')::date;
      v_daypart := (v_option->>'daypart')::public.quote_daypart;
    exception when others then
      raise exception 'INVALID_COUNTER_OPTIONS';
    end;
    if v_date = v_booking.requested_local_date then
      raise exception 'COUNTER_DATE_MUST_CHANGE';
    end if;
    if exists (
      select 1 from pg_temp.valid_quote_options o where o.local_date = v_date
    ) then raise exception 'DUPLICATE_COUNTER_DATE'; end if;
    if private.first_quote_daypart_slot(
      v_booking.provider_id, v_date, v_daypart, p_estimated_minutes,
      v_now + interval '12 hours', p_booking_id
    ) is null then raise exception 'QUOTE_DAYPART_UNAVAILABLE'; end if;
    insert into pg_temp.valid_quote_options values (v_ordinal, v_date, v_daypart);
  end loop;

  select min(private.quote_daypart_start(local_date, daypart))
  into v_earliest from pg_temp.valid_quote_options;
  v_due := least(
    v_now + interval '24 hours',
    (v_earliest at time zone 'America/Chicago') - interval '12 hours'
  );
  if v_due <= v_now then raise exception 'COUNTER_WINDOW_UNAVAILABLE'; end if;
  v_round := v_booking.quote_negotiation_round + 1;

  insert into public.booking_quote_provider_estimates (
    booking_id, estimated_minutes, updated_at
  ) values (p_booking_id, p_estimated_minutes, v_now)
  on conflict (booking_id) do update set
    estimated_minutes = excluded.estimated_minutes,
    updated_at = excluded.updated_at;

  insert into public.booking_quote_counter_options (
    booking_id, round_number, ordinal, local_date, daypart, offered_at, expires_at
  )
  select p_booking_id, v_round, ordinal, local_date, daypart, v_now, v_due
  from pg_temp.valid_quote_options order by ordinal;

  perform set_config('college_crew.trusted_booking_operation', 'on', true);
  update public.bookings
  set status = 'countered',
      quote_negotiation_round = v_round,
      counter_note = nullif(btrim(coalesce(p_note, '')), ''),
      countered_at = v_now
  where id = p_booking_id and status = 'requested';

  perform private.enqueue_booking_automation_job(
    'quote_counter_expiration_' || p_booking_id::text || '_' || v_round::text,
    'quote_response_expiration', p_booking_id, p_booking_id, v_due
  );
  perform private.enqueue_participant_email(
    'quote_counter_' || p_booking_id::text || '_' || v_round::text,
    p_booking_id, 'customer', 'quote_counter_options',
    jsonb_build_object('booking_id', p_booking_id, 'round', v_round)
  );
  return v_round;
end;
$$;

create or replace function public.select_quote_counter_option(
  p_booking_id uuid,
  p_option_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := statement_timestamp();
  v_booking public.bookings%rowtype;
  v_option public.booking_quote_counter_options%rowtype;
  v_estimate integer;
begin
  select b.* into v_booking from public.bookings b
  where b.id = p_booking_id and b.booking_flow = 'quote_v2'
    and b.customer_id = (select auth.uid())
  for update;
  if not found then raise exception 'BOOKING_NOT_FOUND'; end if;
  if v_booking.status <> 'countered' then raise exception 'REQUEST_NO_LONGER_OPEN'; end if;
  select o.* into v_option from public.booking_quote_counter_options o
  where o.id = p_option_id and o.booking_id = p_booking_id
    and o.round_number = v_booking.quote_negotiation_round
  for update;
  if not found then raise exception 'COUNTER_OPTION_NOT_FOUND'; end if;
  if v_option.expires_at <= v_now then raise exception 'REQUEST_EXPIRED'; end if;
  select e.estimated_minutes into v_estimate
  from public.booking_quote_provider_estimates e where e.booking_id = p_booking_id;
  if v_estimate is null then raise exception 'INVALID_DURATION'; end if;
  if private.first_quote_daypart_slot(
    v_booking.provider_id, v_option.local_date, v_option.daypart, v_estimate,
    v_now + interval '12 hours', p_booking_id
  ) is null then raise exception 'QUOTE_DAYPART_UNAVAILABLE'; end if;

  update public.booking_quote_counter_options
  set selected_at = v_now where id = v_option.id and selected_at is null;
  perform set_config('college_crew.trusted_booking_operation', 'on', true);
  update public.bookings
  set status = 'requested',
      requested_local_date = v_option.local_date,
      requested_daypart = v_option.daypart,
      response_alert_at = v_now + interval '2 hours',
      counter_note = null
  where id = p_booking_id and status = 'countered';
  perform private.enqueue_booking_automation_job(
    'quote_response_expiration_' || p_booking_id::text || '_'
      || v_booking.quote_negotiation_round::text || '_selected',
    'quote_response_expiration', p_booking_id, p_booking_id,
    v_now + interval '2 hours'
  );
  perform private.enqueue_participant_email(
    'quote_option_selected_' || p_booking_id::text || '_'
      || v_booking.quote_negotiation_round::text,
    p_booking_id, 'provider', 'quote_option_selected',
    jsonb_build_object('booking_id', p_booking_id)
  );
  return p_booking_id;
end;
$$;

create or replace function public.send_booking_quote(
  p_booking_id uuid,
  p_quote_cents integer,
  p_scheduled_at timestamptz,
  p_estimated_minutes integer
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := statement_timestamp();
  v_actor uuid := (select auth.uid());
  v_booking public.bookings%rowtype;
  v_local timestamp;
  v_end_local timestamp;
  v_existing_estimate integer;
  v_due timestamptz;
  v_deposit integer;
begin
  if p_quote_cents is null or p_quote_cents not between 2000 and 1000000 then
    raise exception 'INVALID_FINAL_QUOTE';
  end if;
  select b.* into v_booking from public.bookings b
  where b.id = p_booking_id and b.booking_flow = 'quote_v2'
    and public.owns_provider_profile(b.provider_id)
  for update;
  if not found then raise exception 'BOOKING_NOT_FOUND'; end if;
  if v_booking.status <> 'requested' then raise exception 'REQUEST_NO_LONGER_OPEN'; end if;
  if v_booking.response_alert_at is null or v_booking.response_alert_at <= v_now then
    raise exception 'REQUEST_EXPIRED';
  end if;
  if p_estimated_minutes not between 60 and 720
    or p_estimated_minutes % 15 <> 0 then raise exception 'INVALID_DURATION'; end if;
  select e.estimated_minutes into v_existing_estimate
  from public.booking_quote_provider_estimates e
  where e.booking_id = p_booking_id;
  if v_existing_estimate is not null
    and v_existing_estimate <> p_estimated_minutes then
    raise exception 'QUOTE_DURATION_CHANGED';
  end if;
  if p_scheduled_at <= v_now then raise exception 'REQUEST_EXPIRED'; end if;
  v_local := p_scheduled_at at time zone 'America/Chicago';
  v_end_local := v_local + make_interval(mins => p_estimated_minutes);
  if v_local::date <> v_booking.requested_local_date
    or v_end_local::date <> v_booking.requested_local_date then
    raise exception 'EXACT_START_OUTSIDE_REQUEST';
  end if;
  if not (
    (v_booking.requested_daypart = 'morning'
      and v_local::time >= time '08:00' and v_local::time < time '12:00')
    or (v_booking.requested_daypart = 'afternoon'
      and v_local::time >= time '12:00' and v_local::time <= time '17:00')
    or (v_booking.requested_daypart = 'either'
      and v_local::time >= time '08:00' and v_local::time <= time '17:00')
  ) then raise exception 'EXACT_START_OUTSIDE_REQUEST'; end if;
  if not exists (
    select 1 from private.provider_effective_window(
      v_booking.provider_id, v_booking.requested_local_date
    ) ew
    where v_local::time >= ew.start_local and v_end_local::time <= ew.end_local
  ) then raise exception 'OUTSIDE_PROVIDER_AVAILABILITY'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_booking.provider_id::text, 0));
  if private.provider_has_reserved_slot_conflict(
    v_booking.provider_id, p_scheduled_at, p_estimated_minutes, p_booking_id
  ) then raise exception 'PROVIDER_SLOT_ALREADY_RESERVED'; end if;
  if not private.has_current_legal_document(v_actor, 'platform_terms')
    or not private.has_current_legal_document(v_actor, 'provider_terms') then
    raise exception 'LEGAL_ACCEPTANCE_REQUIRED';
  end if;
  if not exists (
    select 1 from public.provider_services ps
    where ps.provider_id = v_booking.provider_id
      and ps.service_id = v_booking.service_id
      and public.is_provider_offering_quote_bookable(ps.id)
  ) then raise exception 'PROVIDER_NO_LONGER_READY'; end if;

  insert into public.booking_quote_provider_estimates (
    booking_id, estimated_minutes, updated_at
  ) values (p_booking_id, p_estimated_minutes, v_now)
  on conflict (booking_id) do update set
    estimated_minutes = excluded.estimated_minutes,
    updated_at = excluded.updated_at;
  v_deposit := ((p_quote_cents::bigint * 2000 + 5000) / 10000)::integer;
  v_due := least(v_now + interval '24 hours',
                 p_scheduled_at - interval '6 hours');
  if v_due <= v_now then raise exception 'QUOTE_PAYMENT_WINDOW_UNAVAILABLE'; end if;
  perform set_config('college_crew.trusted_booking_operation', 'on', true);
  update public.bookings
  set scheduled_at = p_scheduled_at,
      estimated_minutes = null,
      price_cents = p_quote_cents,
      platform_fee_cents =
        ((p_quote_cents::bigint * 500 + 5000) / 10000)::integer,
      upfront_payment_cents = v_deposit,
      quote_sent_at = v_now,
      accepted_at = v_now,
      initial_payment_due_at = v_due,
      status = 'accepted'
  where id = p_booking_id and status = 'requested';
  perform private.enqueue_booking_automation_job(
    'quote_payment_expiration_' || p_booking_id::text,
    'quote_payment_expiration', p_booking_id, p_booking_id, v_due
  );
  return p_booking_id;
end;
$$;

create or replace function public.withdraw_quote_negotiation(p_booking_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking public.bookings%rowtype;
begin
  select b.* into v_booking from public.bookings b
  where b.id = p_booking_id and b.booking_flow = 'quote_v2'
    and b.customer_id = (select auth.uid())
  for update;
  if not found then raise exception 'BOOKING_NOT_FOUND'; end if;
  if v_booking.status not in ('countered', 'accepted') then
    raise exception 'REQUEST_NO_LONGER_OPEN';
  end if;
  perform set_config('college_crew.trusted_booking_operation', 'on', true);
  update public.bookings
  set status = 'withdrawn', withdrawn_at = statement_timestamp(),
      withdrawn_by = (select auth.uid()),
      withdrawal_reason = 'customer_declined_quote_or_schedule',
      cancellation_policy_result = 'no_payment'
  where id = p_booking_id and status = v_booking.status;
  return p_booking_id;
end;
$$;

create or replace function public.expire_quote_booking_stage(p_booking_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := statement_timestamp();
  v_booking public.bookings%rowtype;
  v_counter_due timestamptz;
begin
  select b.* into v_booking from public.bookings b
  where b.id = p_booking_id and b.booking_flow = 'quote_v2' for update;
  if not found then raise exception 'BOOKING_NOT_FOUND'; end if;
  if v_booking.status = 'requested' and v_booking.response_alert_at <= v_now then
    perform set_config('college_crew.trusted_booking_operation', 'on', true);
    update public.bookings set status = 'expired', expired_at = v_now
    where id = p_booking_id and status = 'requested';
    return 'response_expired';
  end if;
  if v_booking.status = 'countered' then
    select min(o.expires_at) into v_counter_due
    from public.booking_quote_counter_options o
    where o.booking_id = p_booking_id
      and o.round_number = v_booking.quote_negotiation_round;
    if v_counter_due is not null and v_counter_due <= v_now then
      perform set_config('college_crew.trusted_booking_operation', 'on', true);
      update public.bookings set status = 'expired', expired_at = v_now
      where id = p_booking_id and status = 'countered';
      return 'counter_expired';
    end if;
  end if;
  if v_booking.status = 'accepted'
    and v_booking.initial_payment_due_at <= v_now then
    perform set_config('college_crew.trusted_booking_operation', 'on', true);
    update public.bookings set status = 'expired', expired_at = v_now
    where id = p_booking_id and status = 'accepted';
    return 'payment_expired';
  end if;
  return 'not_due';
end;
$$;

create or replace function public.enforce_booking_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  trusted_operation boolean :=
    coalesce(current_setting('college_crew.trusted_booking_operation', true), '') = 'on';
begin
  if new.status = old.status then return new; end if;
  if old.booking_flow in ('legacy', 'quote_v1') then
    if not (
      (old.status = 'requested' and new.status in ('accepted','declined','cancelled'))
      or (old.status = 'accepted' and new.status in ('paid','cancelled'))
      or (old.status = 'paid' and new.status = 'completed')
    ) then raise exception 'illegal full-price booking transition'; end if;
    return new;
  end if;
  if (select auth.uid()) is not null and not trusted_operation then
    raise exception 'booking transitions require a trusted operation';
  end if;
  if not (
    (old.status = 'requested' and new.status in
      ('accepted','declined','withdrawn','expired','cancelled','countered'))
    or (old.status = 'countered' and new.status in
      ('requested','declined','withdrawn','expired','cancelled'))
    or (old.status = 'accepted' and new.status in
      ('booked','withdrawn','expired','cancelled'))
    or (old.status = 'booked' and new.status in ('in_progress','disputed','cancelled'))
    or (old.status = 'in_progress' and new.status in ('invoice_review','disputed'))
    or (old.status = 'invoice_review' and new.status in ('completed','disputed'))
    or (old.status = 'disputed' and new.status in ('completed','cancelled'))
  ) then raise exception 'illegal booking transition: % -> %', old.status, new.status;
  end if;
  return new;
end;
$$;

create or replace function private.enforce_quote_booking_immutability()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  trusted_operation boolean :=
    coalesce(current_setting('college_crew.trusted_booking_operation', true), '') = 'on';
begin
  if new.average_quote_cents_snapshot is distinct from old.average_quote_cents_snapshot
    then raise exception 'average quote snapshot is immutable'; end if;
  if old.booking_flow = 'quote_v2' and old.quote_sent_at is null
    and (
      new.scheduled_at is distinct from old.scheduled_at
      or new.estimated_minutes is distinct from old.estimated_minutes
      or new.requested_local_date is distinct from old.requested_local_date
      or new.requested_daypart is distinct from old.requested_daypart
    )
    and not trusted_operation then
    raise exception 'quote schedule changes require a trusted operation';
  end if;
  if old.booking_flow in ('quote_v1', 'quote_v2') and old.quote_sent_at is not null
    and (
      new.quote_sent_at is distinct from old.quote_sent_at
      or new.price_cents is distinct from old.price_cents
      or new.platform_fee_cents is distinct from old.platform_fee_cents
      or new.deposit_bps is distinct from old.deposit_bps
      or new.upfront_payment_cents is distinct from old.upfront_payment_cents
      or new.scheduled_at is distinct from old.scheduled_at
      or new.estimated_minutes is distinct from old.estimated_minutes
      or new.requested_local_date is distinct from old.requested_local_date
      or new.requested_daypart is distinct from old.requested_daypart
    ) then raise exception 'final quote and schedule are immutable'; end if;
  return new;
end;
$$;

revoke all on function public.counter_quote_booking_request(
  uuid, integer, jsonb, text
), public.select_quote_counter_option(uuid, uuid),
  public.send_booking_quote(uuid, integer, timestamptz, integer),
  public.withdraw_quote_negotiation(uuid)
  from public, anon;
grant execute on function public.counter_quote_booking_request(
  uuid, integer, jsonb, text
), public.select_quote_counter_option(uuid, uuid),
  public.send_booking_quote(uuid, integer, timestamptz, integer),
  public.withdraw_quote_negotiation(uuid)
  to authenticated;
revoke all on function public.send_booking_quote(uuid, integer)
  from public, anon, authenticated;
