-- Temporary founder-controlled test mode for the end-to-end booking flows.
--
-- This removes only timing gates while the content flag is true. Availability,
-- authentication, payment authorization/deposit, and state-machine checks stay
-- in force. Set booking.test-time-restrictions-disabled to false to restore the
-- pilot's normal notice, en-route, arrival, and quote-payment timing rules.

begin;

set local lock_timeout = '10s';
set local statement_timeout = '2min';

insert into public.site_content (key, value)
values ('booking.test-time-restrictions-disabled', 'true')
on conflict (key) do update set
  value = excluded.value,
  updated_at = statement_timestamp(),
  updated_by = null;

create or replace function private.booking_time_restrictions_disabled()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select lower(btrim(sc.value)) = 'true'
    from public.site_content sc
    where sc.key = 'booking.test-time-restrictions-disabled'
  ), false);
$$;

revoke all on function private.booking_time_restrictions_disabled()
  from public, anon, authenticated, service_role;

-- Hourly: retain every offering and availability validation, but temporarily
-- permit a future in-window start without the normal notice period.
create or replace function private.assert_hourly_offering_slot(
  p_provider_service_id uuid,
  p_scheduled_at timestamptz,
  p_estimated_minutes integer,
  p_now timestamptz,
  p_expected_service_id uuid default null
)
returns table (
  provider_id uuid,
  service_id uuid,
  hourly_rate_cents integer,
  provider_display_name text,
  service_name text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_minimum_notice_hours integer;
  v_local_start timestamp;
  v_local_end timestamp;
begin
  if p_estimated_minutes < 60
    or p_estimated_minutes > 720
    or p_estimated_minutes % 15 <> 0 then
    raise exception 'INVALID_DURATION';
  end if;

  select
    ps.provider_id,
    ps.service_id,
    ps.hourly_rate_cents,
    pp.display_name,
    s.name,
    pp.minimum_notice_hours
  into
    provider_id,
    service_id,
    hourly_rate_cents,
    provider_display_name,
    service_name,
    v_minimum_notice_hours
  from public.provider_services ps
  join public.provider_profiles pp on pp.id = ps.provider_id
  join public.services s on s.id = ps.service_id
  where ps.id = p_provider_service_id
    and pp.verification_status = 'approved'
    and pp.stripe_account_id is not null
    and pp.stripe_transfers_active
    and pp.stripe_transfers_checked_at is not null
    and pp.service_zip is not null
    and exists (
      select 1 from public.provider_availability_windows w
      where w.provider_id = pp.id
    )
    and ps.hourly_rate_cents between 2000 and 15000
    and s.is_live;

  if provider_id is null then raise exception 'OFFERING_NOT_BOOKABLE'; end if;
  if p_expected_service_id is not null and service_id <> p_expected_service_id then
    raise exception 'REPLACEMENT_SERVICE_MISMATCH';
  end if;
  if nullif(btrim(provider_display_name), '') is null then
    raise exception 'PROVIDER_NAME_REQUIRED';
  end if;
  if p_scheduled_at < p_now or (
    not private.booking_time_restrictions_disabled()
    and p_scheduled_at < p_now + make_interval(hours => v_minimum_notice_hours)
  ) then
    raise exception 'MINIMUM_NOTICE_NOT_MET';
  end if;

  v_local_start := p_scheduled_at at time zone 'America/Chicago';
  v_local_end := (
    p_scheduled_at + make_interval(mins => p_estimated_minutes)
  ) at time zone 'America/Chicago';

  if v_local_start::date <> v_local_end::date
    or not exists (
      select 1
      from private.provider_effective_window(
        assert_hourly_offering_slot.provider_id,
        v_local_start::date
      ) ew
      where v_local_start::time >= ew.start_local
        and v_local_end::time <= ew.end_local
    ) then
    raise exception 'OUTSIDE_PROVIDER_AVAILABILITY';
  end if;

  return next;
end;
$$;

-- The request response window normally has to end before the scheduled start.
-- In test mode a provider can accept the request immediately instead.
create or replace function private.create_hourly_booking_request_unchecked(
  p_provider_service_id uuid,
  p_scheduled_at timestamptz,
  p_estimated_minutes integer,
  p_response_window_hours integer,
  p_address text,
  p_job_zip text,
  p_details text default '',
  p_address_kind text default 'home',
  p_service_city text default '',
  p_latitude double precision default null,
  p_longitude double precision default null,
  p_on_decline_preference public.booking_decline_preference default 'keep_control',
  p_booking_id uuid default null,
  p_time_flexibility public.booking_time_flexibility default 'fixed'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_now timestamptz := statement_timestamp();
  v_customer_name text;
  v_offering record;
  v_booking_id uuid;
begin
  if v_actor is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  if not exists (
    select 1 from auth.users u
    where u.id = v_actor and u.email_confirmed_at is not null
  ) then raise exception 'EMAIL_CONFIRMATION_REQUIRED'; end if;
  select nullif(btrim(p.full_name), '') into v_customer_name
  from public.profiles p where p.id = v_actor;
  if v_customer_name is null then raise exception 'CUSTOMER_NAME_REQUIRED'; end if;
  if p_response_window_hours not in (1, 2, 3, 5, 12, 24, 48, 72) then
    raise exception 'INVALID_RESPONSE_WINDOW';
  end if;
  if not private.booking_time_restrictions_disabled()
    and v_now + make_interval(hours => p_response_window_hours) >= p_scheduled_at then
    raise exception 'RESPONSE_WINDOW_REACHES_START';
  end if;
  if p_job_zip is null or p_job_zip !~ '^[0-9]{5}$' then raise exception 'INVALID_JOB_ZIP'; end if;
  if char_length(btrim(coalesce(p_address, ''))) < 5
    or char_length(btrim(p_address)) > 500 then raise exception 'INVALID_JOB_ADDRESS'; end if;
  if char_length(btrim(coalesce(p_details, ''))) > 2000 then raise exception 'DETAILS_TOO_LONG'; end if;
  if p_address_kind not in ('home', 'other') then raise exception 'INVALID_ADDRESS_KIND'; end if;
  if char_length(btrim(coalesce(p_service_city, ''))) > 120 then raise exception 'INVALID_SERVICE_CITY'; end if;
  if (p_latitude is null) <> (p_longitude is null)
    or (p_latitude is not null and (p_latitude < -90 or p_latitude > 90))
    or (p_longitude is not null and (p_longitude < -180 or p_longitude > 180)) then
    raise exception 'INVALID_COORDINATES';
  end if;

  select * into v_offering from private.assert_hourly_offering_slot(
    p_provider_service_id, p_scheduled_at, p_estimated_minutes, v_now, null
  );

  insert into public.bookings (
    id, customer_id, provider_id, service_id, status, scheduled_at, address,
    details, price_cents, platform_fee_cents, created_at, booking_flow,
    estimated_minutes, job_zip, address_kind, service_city, latitude, longitude,
    hourly_rate_cents_snapshot, platform_fee_bps, billing_minimum_minutes,
    billing_increment_minutes, cancellation_notice_hours, pilot_timezone,
    response_window_hours, response_alert_at, on_decline_preference,
    time_flexibility, customer_name_snapshot, provider_display_name_snapshot,
    service_name_snapshot, fee_policy_version, cancellation_policy_version,
    terms_version, customer_authorization_version, policy_snapshot,
    customer_authorization_snapshot
  ) values (
    coalesce(p_booking_id, gen_random_uuid()), v_actor, v_offering.provider_id,
    v_offering.service_id, 'requested', p_scheduled_at, btrim(p_address),
    btrim(coalesce(p_details, '')), v_offering.hourly_rate_cents,
    round(v_offering.hourly_rate_cents::numeric * 500 / 10000)::integer,
    v_now, 'hourly_v1', p_estimated_minutes, p_job_zip, p_address_kind,
    btrim(coalesce(p_service_city, '')), p_latitude, p_longitude,
    v_offering.hourly_rate_cents, 500, 60, 15, 12, 'America/Chicago',
    p_response_window_hours, v_now + make_interval(hours => p_response_window_hours),
    coalesce(p_on_decline_preference, 'keep_control'),
    coalesce(p_time_flexibility, 'fixed'), v_customer_name,
    v_offering.provider_display_name, v_offering.service_name,
    'hourly-v1-500bps', 'hourly-v1-12h', '2026-07-08',
    'hourly-v1-saved-method',
    jsonb_build_object(
      'platform_fee_bps', 500, 'billing_minimum_minutes', 60,
      'billing_increment_minutes', 15, 'cancellation_notice_hours', 12,
      'pilot_timezone', 'America/Chicago'
    ),
    jsonb_build_object(
      'version', 'hourly-v1-saved-method', 'scope', 'booking_only',
      'saved_method_authorization_required_at_payment', true
    )
  ) returning id into v_booking_id;
  return v_booking_id;
end;
$$;

-- Quote requests still use the hardened v1 constructor before promotion. For
-- a same-day test, seed that internal constructor with the provider's next
-- normal-notice slot, then immediately promote the request to its real date /
-- daypart. The real requested daypart is separately availability-checked below.
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
  v_seed_scheduled_at timestamptz := p_scheduled_at;
  v_provider_id uuid;
begin
  if p_scheduled_at < v_now + interval '12 hours' then
    if not private.booking_time_restrictions_disabled() then
      raise exception 'MINIMUM_NOTICE_NOT_MET';
    end if;
    select ps.provider_id into v_provider_id
    from public.provider_services ps where ps.id = p_provider_service_id;
    select private.first_quote_daypart_slot(
      v_provider_id, d.local_date::date, 'either', p_estimated_minutes,
      v_now + interval '12 hours', null
    ) into v_seed_scheduled_at
    from generate_series(
      (v_now at time zone 'America/Chicago')::date,
      (v_now at time zone 'America/Chicago')::date + 90,
      interval '1 day'
    ) as d(local_date)
    where private.first_quote_daypart_slot(
      v_provider_id, d.local_date::date, 'either', p_estimated_minutes,
      v_now + interval '12 hours', null
    ) is not null
    order by d.local_date
    limit 1;
    if v_seed_scheduled_at is null then raise exception 'QUOTE_DAYPART_UNAVAILABLE'; end if;
  end if;

  v_id := public.create_quote_booking_request(
    p_provider_service_id, v_seed_scheduled_at, p_estimated_minutes, 1,
    p_address, p_job_zip, p_job_photos, p_details, p_address_kind,
    p_service_city, p_latitude, p_longitude
  );

  perform set_config('college_crew.quote_v2_promotion', 'on', true);
  perform set_config('college_crew.trusted_booking_operation', 'on', true);
  update public.bookings set
    booking_flow = 'quote_v2', response_window_hours = 2,
    response_alert_at = v_now + interval '2 hours', deposit_bps = 2000,
    cancellation_notice_hours = 12, fee_policy_version = 'quote-v2-500bps',
    cancellation_policy_version = 'quote-v2-12h', terms_version = '2026-07-27',
    customer_authorization_version = 'quote-v2-20pct-deposit',
    policy_snapshot = policy_snapshot || jsonb_build_object(
      'deposit_bps', 2000, 'response_window_hours', 2,
      'minimum_notice_hours', 12,
      'quote_payment_rule', 'earlier_of_24h_or_6h_before_start'
    ),
    customer_authorization_snapshot = jsonb_build_object(
      'version', 'quote-v2-20pct-deposit', 'scope', 'booking_only',
      'deposit_bps', 2000, 'remaining_balance_after_job', true,
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
  v_not_before timestamptz;
begin
  select ps.provider_id into v_provider_id
  from public.provider_services ps where ps.id = p_provider_service_id;
  if v_provider_id is null then raise exception 'OFFERING_NOT_BOOKABLE'; end if;
  v_not_before := case when private.booking_time_restrictions_disabled()
    then v_now else v_now + interval '12 hours' end;
  v_slot := private.first_quote_daypart_slot(
    v_provider_id, p_requested_local_date, p_requested_daypart,
    60, v_not_before, null
  );
  if v_slot is null then raise exception 'QUOTE_DAYPART_UNAVAILABLE'; end if;

  v_id := public.create_quote_deposit_booking_request(
    p_provider_service_id, v_slot, 60, p_address, p_job_zip, p_job_photos,
    p_details, p_address_kind, p_service_city, p_latitude, p_longitude
  );
  perform set_config('college_crew.quote_v2_promotion', 'on', true);
  perform set_config('college_crew.trusted_booking_operation', 'on', true);
  update public.bookings set
    requested_local_date = p_requested_local_date,
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

-- Keep the payment deadline open during same-day quote testing; the customer
-- still pays the normal 20% deposit before the booking becomes booked.
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
  from public.booking_quote_provider_estimates e where e.booking_id = p_booking_id;
  if v_existing_estimate is not null and v_existing_estimate <> p_estimated_minutes then
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
    (v_booking.requested_daypart = 'morning' and v_local::time >= time '08:00' and v_local::time < time '12:00')
    or (v_booking.requested_daypart = 'afternoon' and v_local::time >= time '12:00' and v_local::time <= time '17:00')
    or (v_booking.requested_daypart = 'either' and v_local::time >= time '08:00' and v_local::time <= time '17:00')
  ) then raise exception 'EXACT_START_OUTSIDE_REQUEST'; end if;
  if not exists (
    select 1 from private.provider_effective_window(
      v_booking.provider_id, v_booking.requested_local_date
    ) ew where v_local::time >= ew.start_local and v_end_local::time <= ew.end_local
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
  v_due := case when private.booking_time_restrictions_disabled()
    then v_now + interval '24 hours'
    else least(v_now + interval '24 hours', p_scheduled_at - interval '6 hours')
  end;
  if v_due <= v_now then raise exception 'QUOTE_PAYMENT_WINDOW_UNAVAILABLE'; end if;
  perform set_config('college_crew.trusted_booking_operation', 'on', true);
  update public.bookings set
    scheduled_at = p_scheduled_at, estimated_minutes = null,
    price_cents = p_quote_cents,
    platform_fee_cents = ((p_quote_cents::bigint * 500 + 5000) / 10000)::integer,
    upfront_payment_cents = v_deposit, quote_sent_at = v_now, accepted_at = v_now,
    initial_payment_due_at = v_due, status = 'accepted'
  where id = p_booking_id and status = 'requested';
  perform private.enqueue_booking_automation_job(
    'quote_payment_expiration_' || p_booking_id::text,
    'quote_payment_expiration', p_booking_id, p_booking_id, v_due
  );
  return p_booking_id;
end;
$$;

create or replace function public.mark_booking_arrived(p_booking_id uuid)
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
  where b.id = p_booking_id for update;
  if not found then raise exception 'BOOKING_NOT_FOUND'; end if;
  if not public.owns_provider_profile(v_booking.provider_id) then raise exception 'NOT_AUTHORIZED'; end if;
  if v_booking.booking_flow not in ('hourly_v1', 'quote_v2') then raise exception 'UNSUPPORTED_BOOKING_FLOW'; end if;
  if v_booking.status = 'in_progress' then return 'in_progress'; end if;
  if v_booking.status <> 'booked' then raise exception 'BOOKING_NOT_BOOKED:%', v_booking.status; end if;
  if not private.booking_time_restrictions_disabled()
    and v_now < v_booking.scheduled_at - interval '30 minutes' then
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
  if not public.owns_provider_profile(v_booking.provider_id) then raise exception 'NOT_AUTHORIZED'; end if;
  if v_booking.booking_flow not in ('hourly_v1', 'quote_v2') then raise exception 'UNSUPPORTED_BOOKING_FLOW'; end if;
  if v_booking.status <> 'booked' then raise exception 'BOOKING_NOT_BOOKED:%', v_booking.status; end if;
  if v_booking.en_route_at is not null then return v_booking.en_route_at; end if;
  if not private.booking_time_restrictions_disabled()
    and v_now < v_booking.scheduled_at - interval '2 hours' then
    raise exception 'EN_ROUTE_TOO_EARLY';
  end if;
  update public.bookings set en_route_at = v_now
  where id = p_booking_id and status = 'booked' and en_route_at is null;
  return v_now;
end;
$$;

commit;
