-- Location groundwork for "Town · X miles away".
--
-- 1. public.profiles gains geocoded coordinates for the single profile-wide
--    address (customer home / provider operating address). Coordinates are
--    written only by the server (service role) after geocoding the saved
--    address through the free US Census geocoder. There is deliberately NO
--    client update grant on these columns: users edit the address text and the
--    server re-derives coordinates, so clients can never spoof their position.
-- 2. public.bookings snapshots the chosen service location at request time
--    (address_kind home|other, the town for display, and coordinates), so
--    later profile edits never rewrite what an old job displayed.
-- 3. create_hourly_booking_request / replace_hourly_booking_request carry the
--    snapshot through. The coordinate params ride at the same trust level as
--    the client-supplied address text they are derived from: display-only
--    facts for distance lines, never used for money math or authorization.

-- ---------------------------------------------------------------------------
-- 1) profiles: server-written coordinates
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column latitude double precision,
  add column longitude double precision,
  add column geocoded_at timestamptz,
  add constraint profiles_latitude_range check (
    latitude is null or latitude between -90 and 90
  ),
  add constraint profiles_longitude_range check (
    longitude is null or longitude between -180 and 180
  ),
  add constraint profiles_coordinates_paired check (
    (latitude is null) = (longitude is null)
  );

comment on column public.profiles.latitude is
  'Geocoded from the profile address (US Census). Server-written only — no client update grant.';
comment on column public.profiles.geocoded_at is
  'Last geocode attempt. Null coordinates with a timestamp mean the address did not match.';

-- ---------------------------------------------------------------------------
-- 2) bookings: immutable service-location snapshot
-- ---------------------------------------------------------------------------

alter table public.bookings
  add column address_kind text not null default 'home',
  add column service_city text not null default '',
  add column latitude double precision,
  add column longitude double precision,
  add constraint bookings_address_kind_valid check (
    address_kind in ('home', 'other')
  ),
  add constraint bookings_service_city_length check (
    char_length(service_city) <= 120
  ),
  add constraint bookings_latitude_range check (
    latitude is null or latitude between -90 and 90
  ),
  add constraint bookings_longitude_range check (
    longitude is null or longitude between -180 and 180
  ),
  add constraint bookings_coordinates_paired check (
    (latitude is null) = (longitude is null)
  );

comment on column public.bookings.address_kind is
  'Whether the customer booked from their saved home address or a one-off other address.';
comment on column public.bookings.service_city is
  'Town snapshot for the provider-facing "Town · X miles away" line.';

-- ---------------------------------------------------------------------------
-- 3) create_hourly_booking_request: accept the location snapshot
-- ---------------------------------------------------------------------------
-- Dropped and recreated (not overloaded) so PostgREST rpc() resolution stays
-- unambiguous. New params default, so any in-flight deploy still succeeds.

drop function public.create_hourly_booking_request(
  uuid, timestamptz, integer, integer, text, text, text
);

create function public.create_hourly_booking_request(
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
  p_longitude double precision default null
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
  if v_actor is null then
    raise exception 'AUTHENTICATION_REQUIRED';
  end if;
  if not exists (
    select 1 from public.profiles p where p.id = v_actor and p.role = 'customer'
  ) then
    raise exception 'CUSTOMER_ROLE_REQUIRED';
  end if;
  if not exists (
    select 1 from auth.users u
    where u.id = v_actor and u.email_confirmed_at is not null
  ) then
    raise exception 'EMAIL_CONFIRMATION_REQUIRED';
  end if;

  select nullif(btrim(p.full_name), '')
  into v_customer_name
  from public.profiles p
  where p.id = v_actor;
  if v_customer_name is null then
    raise exception 'CUSTOMER_NAME_REQUIRED';
  end if;
  if p_response_window_hours not in (1, 3, 5, 12, 24, 48, 72) then
    raise exception 'INVALID_RESPONSE_WINDOW';
  end if;
  if v_now + make_interval(hours => p_response_window_hours) >= p_scheduled_at then
    raise exception 'RESPONSE_WINDOW_REACHES_START';
  end if;
  if p_job_zip is null or p_job_zip !~ '^[0-9]{5}$' then
    raise exception 'INVALID_JOB_ZIP';
  end if;
  if char_length(btrim(coalesce(p_address, ''))) < 5
    or char_length(btrim(p_address)) > 500 then
    raise exception 'INVALID_JOB_ADDRESS';
  end if;
  if char_length(btrim(coalesce(p_details, ''))) > 2000 then
    raise exception 'DETAILS_TOO_LONG';
  end if;
  if p_address_kind not in ('home', 'other') then
    raise exception 'INVALID_ADDRESS_KIND';
  end if;
  if char_length(btrim(coalesce(p_service_city, ''))) > 120 then
    raise exception 'INVALID_SERVICE_CITY';
  end if;
  if (p_latitude is null) <> (p_longitude is null)
    or (p_latitude is not null and (p_latitude < -90 or p_latitude > 90))
    or (p_longitude is not null and (p_longitude < -180 or p_longitude > 180)) then
    raise exception 'INVALID_COORDINATES';
  end if;

  select * into v_offering
  from private.assert_hourly_offering_slot(
    p_provider_service_id,
    p_scheduled_at,
    p_estimated_minutes,
    v_now,
    null
  );

  insert into public.bookings (
    customer_id,
    provider_id,
    service_id,
    status,
    scheduled_at,
    address,
    details,
    price_cents,
    platform_fee_cents,
    created_at,
    booking_flow,
    estimated_minutes,
    job_zip,
    address_kind,
    service_city,
    latitude,
    longitude,
    hourly_rate_cents_snapshot,
    platform_fee_bps,
    billing_minimum_minutes,
    billing_increment_minutes,
    cancellation_notice_hours,
    pilot_timezone,
    response_window_hours,
    response_alert_at,
    customer_name_snapshot,
    provider_display_name_snapshot,
    service_name_snapshot,
    fee_policy_version,
    cancellation_policy_version,
    terms_version,
    customer_authorization_version,
    policy_snapshot,
    customer_authorization_snapshot
  ) values (
    v_actor,
    v_offering.provider_id,
    v_offering.service_id,
    'requested',
    p_scheduled_at,
    btrim(p_address),
    btrim(coalesce(p_details, '')),
    v_offering.hourly_rate_cents,
    round(v_offering.hourly_rate_cents::numeric * 500 / 10000)::integer,
    v_now,
    'hourly_v1',
    p_estimated_minutes,
    p_job_zip,
    p_address_kind,
    btrim(coalesce(p_service_city, '')),
    p_latitude,
    p_longitude,
    v_offering.hourly_rate_cents,
    500,
    60,
    15,
    12,
    'America/Chicago',
    p_response_window_hours,
    v_now + make_interval(hours => p_response_window_hours),
    v_customer_name,
    v_offering.provider_display_name,
    v_offering.service_name,
    'hourly-v1-500bps',
    'hourly-v1-12h',
    '2026-07-08',
    'hourly-v1-saved-method',
    jsonb_build_object(
      'platform_fee_bps', 500,
      'billing_minimum_minutes', 60,
      'billing_increment_minutes', 15,
      'cancellation_notice_hours', 12,
      'pilot_timezone', 'America/Chicago'
    ),
    jsonb_build_object(
      'version', 'hourly-v1-saved-method',
      'scope', 'booking_only',
      'saved_method_authorization_required_at_payment', true
    )
  )
  returning id into v_booking_id;

  return v_booking_id;
end;
$$;

revoke all on function public.create_hourly_booking_request(
  uuid, timestamptz, integer, integer, text, text, text, text, text,
  double precision, double precision
) from public, anon, authenticated;
grant execute on function public.create_hourly_booking_request(
  uuid, timestamptz, integer, integer, text, text, text, text, text,
  double precision, double precision
) to authenticated;

-- ---------------------------------------------------------------------------
-- 4) replace_hourly_booking_request: carry the snapshot onto the replacement
-- ---------------------------------------------------------------------------
-- Same signature, so create or replace is safe. Only the insert changes: the
-- replacement copies the original's service-location snapshot.

create or replace function public.replace_hourly_booking_request(
  p_original_booking_id uuid,
  p_provider_service_id uuid,
  p_response_window_hours integer
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_now timestamptz := statement_timestamp();
  v_original public.bookings%rowtype;
  v_offering record;
  v_booking_id uuid;
begin
  select b.* into v_original
  from public.bookings b
  where b.id = p_original_booking_id
    and b.booking_flow = 'hourly_v1'
    and b.customer_id = v_actor
  for update;
  if not found then
    raise exception 'BOOKING_NOT_FOUND';
  end if;
  if v_original.status <> 'requested' then
    raise exception 'REQUEST_NO_LONGER_OPEN:%', v_original.status;
  end if;
  if v_original.scheduled_at <= v_now then
    perform set_config('college_crew.trusted_booking_operation', 'on', true);
    update public.bookings
    set status = 'expired', expired_at = v_now
    where id = p_original_booking_id and status = 'requested';
    raise exception 'REQUEST_EXPIRED';
  end if;
  if v_now < v_original.response_alert_at then
    raise exception 'REPLACEMENT_NOT_AVAILABLE_YET';
  end if;
  if p_response_window_hours not in (1, 3, 5, 12, 24, 48, 72)
    or v_now + make_interval(hours => p_response_window_hours)
      >= v_original.scheduled_at then
    raise exception 'INVALID_RESPONSE_WINDOW';
  end if;

  select * into v_offering
  from private.assert_hourly_offering_slot(
    p_provider_service_id,
    v_original.scheduled_at,
    v_original.estimated_minutes,
    v_now,
    v_original.service_id
  );
  if v_offering.provider_id = v_original.provider_id then
    raise exception 'REPLACEMENT_PROVIDER_REQUIRED';
  end if;
  if private.provider_has_reserved_slot_conflict(
    v_offering.provider_id,
    v_original.scheduled_at,
    v_original.estimated_minutes,
    null
  ) then
    raise exception 'PROVIDER_SLOT_ALREADY_RESERVED';
  end if;

  insert into public.bookings (
    customer_id, provider_id, service_id, status, scheduled_at, address, details,
    price_cents, platform_fee_cents, created_at, booking_flow,
    estimated_minutes, job_zip, address_kind, service_city, latitude, longitude,
    hourly_rate_cents_snapshot, platform_fee_bps,
    billing_minimum_minutes, billing_increment_minutes,
    cancellation_notice_hours, pilot_timezone, response_window_hours,
    response_alert_at, replacement_for_booking_id, customer_name_snapshot,
    provider_display_name_snapshot, service_name_snapshot, fee_policy_version,
    cancellation_policy_version, terms_version,
    customer_authorization_version, policy_snapshot,
    customer_authorization_snapshot
  ) values (
    v_original.customer_id,
    v_offering.provider_id,
    v_offering.service_id,
    'requested',
    v_original.scheduled_at,
    v_original.address,
    v_original.details,
    v_offering.hourly_rate_cents,
    round(v_offering.hourly_rate_cents::numeric * 500 / 10000)::integer,
    v_now,
    'hourly_v1',
    v_original.estimated_minutes,
    v_original.job_zip,
    v_original.address_kind,
    v_original.service_city,
    v_original.latitude,
    v_original.longitude,
    v_offering.hourly_rate_cents,
    500,
    60,
    15,
    12,
    'America/Chicago',
    p_response_window_hours,
    v_now + make_interval(hours => p_response_window_hours),
    v_original.id,
    v_original.customer_name_snapshot,
    v_offering.provider_display_name,
    v_offering.service_name,
    'hourly-v1-500bps',
    'hourly-v1-12h',
    '2026-07-08',
    'hourly-v1-saved-method',
    jsonb_build_object(
      'platform_fee_bps', 500,
      'billing_minimum_minutes', 60,
      'billing_increment_minutes', 15,
      'cancellation_notice_hours', 12,
      'pilot_timezone', 'America/Chicago',
      'replacement_for_booking_id', v_original.id
    ),
    jsonb_build_object(
      'version', 'hourly-v1-saved-method',
      'scope', 'booking_only',
      'saved_method_authorization_required_at_payment', true
    )
  ) returning id into v_booking_id;

  perform set_config('college_crew.trusted_booking_operation', 'on', true);
  update public.bookings
  set
    status = 'withdrawn',
    withdrawn_at = v_now,
    withdrawn_by = v_actor,
    withdrawal_reason = 'customer_requested_replacement',
    replaced_by_booking_id = v_booking_id
  where id = p_original_booking_id and status = 'requested';
  if not found then
    raise exception 'REQUEST_NO_LONGER_OPEN';
  end if;

  return v_booking_id;
end;
$$;
