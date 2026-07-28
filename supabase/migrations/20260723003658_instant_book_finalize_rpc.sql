-- Instant-book: booking creator gains an explicit id + decline preference, and
-- the atomic finalize RPC that creates the booking with its authorized hold.
-- Applied to the shared project via MCP apply_migration on 2026-07-22.

-- Recreate the unchecked creator with an explicit id + decline preference, and
-- allow the new 2h response window. Drop first: the signature changes.
drop function if exists private.create_hourly_booking_request_unchecked(uuid, timestamptz, integer, integer, text, text, text, text, text, double precision, double precision);

create or replace function private.create_hourly_booking_request_unchecked(p_provider_service_id uuid, p_scheduled_at timestamp with time zone, p_estimated_minutes integer, p_response_window_hours integer, p_address text, p_job_zip text, p_details text DEFAULT ''::text, p_address_kind text DEFAULT 'home'::text, p_service_city text DEFAULT ''::text, p_latitude double precision DEFAULT NULL::double precision, p_longitude double precision DEFAULT NULL::double precision, p_on_decline_preference public.booking_decline_preference DEFAULT 'keep_control'::public.booking_decline_preference, p_booking_id uuid DEFAULT NULL::uuid)
 returns uuid
 language plpgsql
 security definer
 set search_path to ''
as $function$
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
  if p_response_window_hours not in (1, 2, 3, 5, 12, 24, 48, 72) then
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
    id, customer_id, provider_id, service_id, status, scheduled_at, address,
    details, price_cents, platform_fee_cents, created_at, booking_flow,
    estimated_minutes, job_zip, address_kind, service_city, latitude, longitude,
    hourly_rate_cents_snapshot, platform_fee_bps, billing_minimum_minutes,
    billing_increment_minutes, cancellation_notice_hours, pilot_timezone,
    response_window_hours, response_alert_at, on_decline_preference,
    customer_name_snapshot, provider_display_name_snapshot, service_name_snapshot,
    fee_policy_version, cancellation_policy_version, terms_version,
    customer_authorization_version, policy_snapshot, customer_authorization_snapshot
  ) values (
    coalesce(p_booking_id, gen_random_uuid()),
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
    coalesce(p_on_decline_preference, 'keep_control'),
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
$function$;

-- Step B: atomically create the booking + its authorized first-hour payment row,
-- once the card hold is confirmed. The provider notification (fired by the insert
-- trigger) therefore only ever fires for a paid-and-held request.
create or replace function public.finalize_hourly_booking(p_stripe_payment_intent_id text)
 returns uuid
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_actor uuid := (select auth.uid());
  v_draft public.booking_drafts%rowtype;
  v_booking_id uuid;
  v_connected_account text;
  v_fee_cents integer;
  v_auth_version text;
begin
  if v_actor is null then raise exception 'AUTH_REQUIRED'; end if;

  select d.* into v_draft
  from public.booking_drafts d
  where d.stripe_payment_intent_id = p_stripe_payment_intent_id
    and d.customer_id = v_actor
  for update;
  if not found then raise exception 'DRAFT_NOT_FOUND'; end if;

  -- Idempotency: if the booking already exists (double-submit), just return it.
  if exists (select 1 from public.bookings b where b.id = v_draft.booking_id) then
    delete from public.booking_drafts where id = v_draft.id;
    return v_draft.booking_id;
  end if;

  perform private.assert_can_book_hourly(v_draft.provider_service_id);

  perform set_config('college_crew.hourly_legal_publication', 'on', true);
  v_booking_id := private.create_hourly_booking_request_unchecked(
    v_draft.provider_service_id, v_draft.scheduled_at, v_draft.estimated_minutes,
    2, v_draft.address, v_draft.job_zip, v_draft.details,
    v_draft.address_kind, v_draft.service_city, v_draft.latitude, v_draft.longitude,
    v_draft.on_decline_preference, v_draft.booking_id
  );

  select pp.stripe_account_id, b.customer_authorization_version
  into v_connected_account, v_auth_version
  from public.bookings b
  join public.provider_profiles pp on pp.id = b.provider_id
  where b.id = v_booking_id;
  if coalesce(btrim(v_connected_account), '') = '' then
    raise exception 'PROVIDER_NOT_PAYOUT_READY';
  end if;

  v_fee_cents := ((v_draft.hourly_rate_cents::bigint * 500 + 5000) / 10000)::integer;

  insert into public.booking_payments (
    booking_id, kind, amount_cents, application_fee_cents, currency, status,
    idempotency_key, stripe_connected_account_id, stripe_payment_intent_id,
    stripe_customer_id, customer_authorization_version, authorized_at
  ) values (
    v_booking_id, 'first_hour', v_draft.hourly_rate_cents, v_fee_cents, 'usd', 'authorized',
    'fh_' || v_booking_id::text, v_connected_account, p_stripe_payment_intent_id,
    v_draft.stripe_customer_id, v_auth_version, statement_timestamp()
  );

  delete from public.booking_drafts where id = v_draft.id;
  return v_booking_id;
end;
$function$;

grant execute on function public.finalize_hourly_booking(text) to authenticated;
