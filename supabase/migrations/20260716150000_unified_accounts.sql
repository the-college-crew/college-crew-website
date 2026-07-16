-- Unified accounts: "provider" becomes a capability of the base account, not a
-- separate account type (agreed 2026-07-16, single-branch rollout).
--
--   * profiles.role now only separates 'admin' from regular accounts; every
--     regular account is 'customer'. The 'provider' enum value remains in
--     public.user_role (Postgres cannot drop enum values) but is dead — nothing
--     assigns it and nothing reads it after this migration.
--   * "Is a provider" = owns a public.provider_profiles row, which is the test
--     RLS has used all along (owns_provider_profile). Verification/approval
--     still gates going live; nothing about that changes.
--   * Providers gain every customer capability. Two new booking guards:
--     a provider can never book their own listing (SELF_BOOKING_NOT_ALLOWED)
--     and admin/founder accounts cannot book at all (ADMIN_BOOKING_NOT_ALLOWED).
--   * legal_acceptances.role becomes the accepted agreement VARIANT (which
--     section set the user was shown), no longer their account role. The
--     provider variant is a strict superset of the customer variant (sections
--     apply to "all" or "provider"), so a provider acceptance satisfies any
--     customer-level requirement.

-- ---------------------------------------------------------------------------
-- 1) Signup: no more role selection. Admin allowlist wins, everyone else is a
--    customer; the 'role' signup metadata key is ignored from here on.
--    (Body otherwise preserved from 20260706154426_signup_profile_fields.sql.)
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  insert into public.profiles (
    id, role, full_name,
    date_of_birth, address_line1, address_line2, city, state, postal_code
  )
  values (
    new.id,
    case
      when exists (
        select 1 from public.admin_allowlist
        where email = lower(new.email)
      ) then 'admin'::public.user_role
      else 'customer'::public.user_role
    end,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    nullif(new.raw_user_meta_data ->> 'date_of_birth', '')::date,
    coalesce(new.raw_user_meta_data ->> 'address_line1', ''),
    coalesce(new.raw_user_meta_data ->> 'address_line2', ''),
    coalesce(new.raw_user_meta_data ->> 'city', ''),
    coalesce(new.raw_user_meta_data ->> 'state', ''),
    coalesce(new.raw_user_meta_data ->> 'postal_code', '')
  );
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2) Backfill: existing provider accounts become regular accounts. Their
--    provider_profiles rows are untouched — that row IS their provider
--    capability now.
-- ---------------------------------------------------------------------------

update public.profiles
set role = 'customer'
where role = 'provider';

-- ---------------------------------------------------------------------------
-- 3) Resend-confirmation routing: role no longer encodes "signed up to
--    provide", so route by explicit signup intent metadata instead (new
--    signups from provider onboarding set signup_intent='provider'; the
--    legacy 'role' metadata covers accounts that predate this migration).
--    Service-role only, like its predecessor: answering questions about an
--    arbitrary email is an account-enumeration primitive.
-- ---------------------------------------------------------------------------

drop function public.signup_role_for_email(text);

create function public.signup_intent_for_email(p_email text)
returns text
language sql
security definer
set search_path = ''
stable
as $$
  select case
    when u.raw_user_meta_data ->> 'signup_intent' = 'provider'
      or u.raw_user_meta_data ->> 'role' = 'provider'
    then 'provider'
    else 'customer'
  end
  from auth.users u
  where lower(u.email) = lower(p_email)
  limit 1;
$$;

revoke all on function public.signup_intent_for_email(text) from public;
revoke all on function public.signup_intent_for_email(text) from anon;
revoke all on function public.signup_intent_for_email(text) from authenticated;
grant execute on function public.signup_intent_for_email(text) to service_role;

-- ---------------------------------------------------------------------------
-- 4) legal_acceptances.role is now the agreement variant. Users may accept
--    the customer or provider variant regardless of account role (a customer
--    accepts the provider variant when starting provider onboarding); the
--    'admin' variant still requires actually being an admin so a regular user
--    cannot record founder-flavored acceptances.
-- ---------------------------------------------------------------------------

comment on column public.legal_acceptances.role is
  'Agreement variant the user was shown and accepted (customer|provider section set), not their account role.';

-- One acceptance per VARIANT per version, not per version: a customer who
-- later starts providing must be able to record the provider-variant
-- acceptance alongside their earlier customer one.
drop index public.legal_acceptances_master_once_per_version_idx;
create unique index legal_acceptances_master_once_per_variant_idx
  on public.legal_acceptances (user_id, kind, role, version)
  where kind = 'master_agreement';

drop policy if exists "Users insert their own legal acceptances"
  on public.legal_acceptances;

create policy "Users insert their own legal acceptances"
  on public.legal_acceptances for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (
      (
        kind = 'master_agreement'
        and booking_id is null
        and (
          role in ('customer', 'provider')
          or exists (
            select 1
            from public.profiles p
            where p.id = (select auth.uid())
              and p.role = legal_acceptances.role
          )
        )
      )
      or
      (
        kind = 'booking_addendum'
        and role = 'customer'
        and exists (
          select 1
          from public.bookings b
          where b.id = legal_acceptances.booking_id
            and b.customer_id = (select auth.uid())
            and b.status = 'accepted'
        )
      )
    )
  );

-- ---------------------------------------------------------------------------
-- 5) Provider acceptance covers customer requirements. The provider master
--    agreement contains every customer section plus the provider ones, so a
--    user who accepted the current provider variant must pass customer-level
--    legal gates (otherwise a provider booking another provider would be asked
--    to accept a subset of terms they already agreed to).
-- ---------------------------------------------------------------------------

create or replace function private.has_current_master_agreement(
  p_user_id uuid,
  p_role public.user_role
)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from private.current_legal_acceptance_contract c
    join public.legal_acceptances la
      on la.user_id = p_user_id
      and la.kind = 'master_agreement'
      and la.role = c.role
      and la.version = c.version
      and la.content_hash = c.content_hash
    where c.role = p_role
      or (p_role = 'customer' and c.role = 'provider')
  );
$$;

-- ---------------------------------------------------------------------------
-- 6) Booking creation: drop the account-role gate. The private implementation
--    keeps every other check (email confirmation, name, windows, address,
--    coordinates, offering slot). Who may book is decided in the public
--    wrappers below. Body otherwise identical to
--    20260715203000_location_coordinates.sql.
-- ---------------------------------------------------------------------------

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

-- ---------------------------------------------------------------------------
-- 7) Public booking wrappers: who may book. Any confirmed regular account may
--    book any listing except its own; admin (founder) accounts stay blocked.
--    Bodies otherwise identical to 20260715230450_hourly_legal_publication.sql.
-- ---------------------------------------------------------------------------

create or replace function public.create_hourly_booking_request(
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
language plpgsql security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_booking_id uuid;
begin
  if v_actor is null then
    raise exception 'AUTHENTICATION_REQUIRED';
  end if;
  if exists (
    select 1 from public.profiles p
    where p.id = v_actor and p.role = 'admin'
  ) then
    raise exception 'ADMIN_BOOKING_NOT_ALLOWED';
  end if;
  if exists (
    select 1
    from public.provider_services ps
    join public.provider_profiles pp on pp.id = ps.provider_id
    where ps.id = p_provider_service_id and pp.user_id = v_actor
  ) then
    raise exception 'SELF_BOOKING_NOT_ALLOWED';
  end if;
  if not private.has_current_master_agreement(v_actor, 'customer') then
    raise exception 'LEGAL_ACCEPTANCE_REQUIRED';
  end if;
  if not public.is_provider_offering_hourly_bookable(
    p_provider_service_id
  ) then
    raise exception 'OFFERING_NOT_BOOKABLE';
  end if;

  perform set_config(
    'college_crew.hourly_legal_publication', 'on', true
  );
  v_booking_id := private.create_hourly_booking_request_unchecked(
    p_provider_service_id,
    p_scheduled_at,
    p_estimated_minutes,
    p_response_window_hours,
    p_address,
    p_job_zip,
    p_details,
    p_address_kind,
    p_service_city,
    p_latitude,
    p_longitude
  );
  return v_booking_id;
end;
$$;

create or replace function public.replace_hourly_booking_request(
  p_original_booking_id uuid,
  p_provider_service_id uuid,
  p_response_window_hours integer
)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_booking_id uuid;
begin
  if v_actor is null then
    raise exception 'AUTHENTICATION_REQUIRED';
  end if;
  if exists (
    select 1 from public.profiles p
    where p.id = v_actor and p.role = 'admin'
  ) then
    raise exception 'ADMIN_BOOKING_NOT_ALLOWED';
  end if;
  if exists (
    select 1
    from public.provider_services ps
    join public.provider_profiles pp on pp.id = ps.provider_id
    where ps.id = p_provider_service_id and pp.user_id = v_actor
  ) then
    raise exception 'SELF_BOOKING_NOT_ALLOWED';
  end if;
  if not private.has_current_master_agreement(v_actor, 'customer') then
    raise exception 'LEGAL_ACCEPTANCE_REQUIRED';
  end if;
  if not public.is_provider_offering_hourly_bookable(
    p_provider_service_id
  ) then
    raise exception 'OFFERING_NOT_BOOKABLE';
  end if;

  perform set_config(
    'college_crew.hourly_legal_publication', 'on', true
  );
  v_booking_id := private.replace_hourly_booking_request_unchecked(
    p_original_booking_id,
    p_provider_service_id,
    p_response_window_hours
  );
  return v_booking_id;
end;
$$;
