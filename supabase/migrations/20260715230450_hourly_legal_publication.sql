-- Publish Hourly Booking v1 terms as legal content version 2026-07-15.
--
-- The browser may insert its own immutable legal_acceptances row, so trusted
-- hourly operations must compare that row with a server-owned exact
-- version/hash contract. Historical bookings retain their stored versions;
-- only new requests, new provider acceptances, and first-hour payments require
-- the newly published agreement.

create table private.current_legal_acceptance_contract (
  role public.user_role primary key,
  version text not null,
  content_hash text not null,
  constraint current_legal_acceptance_version_not_blank
    check (btrim(version) <> ''),
  constraint current_legal_acceptance_hash_shape
    check (content_hash ~ '^[0-9a-f]{64}$')
);

revoke all on table private.current_legal_acceptance_contract from public;

insert into private.current_legal_acceptance_contract (
  role, version, content_hash
)
values
  (
    'customer',
    '2026-07-15',
    'c23126dcfbd3b87132b66c7786de09a940edac9270bb5c59e423ce52dca43ed1'
  ),
  (
    'provider',
    '2026-07-15',
    'e89347ece1acb4359f73bc6d368bdef77775b7aac84da6e463430f17f7b745ca'
  );

comment on table private.current_legal_acceptance_contract is
  'Server-owned exact role/version/hash contract for actions that require the current Master Service Agreement.';

create function private.has_current_master_agreement(
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
  );
$$;

revoke all on function private.has_current_master_agreement(
  uuid, public.user_role
) from public;

create function private.enforce_hourly_request_legal_contract()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if new.booking_flow = 'hourly_v1'
    and current_setting(
      'college_crew.hourly_legal_publication', true
    ) = 'on' then
    new.terms_version := '2026-07-15';
    new.customer_authorization_version :=
      'hourly-v1-saved-method-2026-07-15';
    new.customer_authorization_snapshot :=
      coalesce(new.customer_authorization_snapshot, '{}'::jsonb)
      || jsonb_build_object(
        'version', 'hourly-v1-saved-method-2026-07-15'
      );
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_hourly_request_legal_contract()
  from public;

create trigger bookings_enforce_hourly_request_legal_contract
before insert on public.bookings
for each row execute function private.enforce_hourly_request_legal_contract();

create function private.enforce_hourly_acceptance_legal_contract()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_provider_user_id uuid;
begin
  if old.booking_flow = 'hourly_v1'
    and old.status = 'requested'
    and new.status = 'accepted'
    and v_actor is not null then
    select pp.user_id
    into v_provider_user_id
    from public.provider_profiles pp
    where pp.id = new.provider_id;

    if v_provider_user_id is distinct from v_actor
      or not private.has_current_master_agreement(v_actor, 'provider') then
      raise exception 'LEGAL_ACCEPTANCE_REQUIRED';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_hourly_acceptance_legal_contract()
  from public;

create trigger bookings_enforce_hourly_acceptance_legal_contract
before update on public.bookings
for each row execute function private.enforce_hourly_acceptance_legal_contract();

create or replace function public.is_provider_offering_hourly_bookable(
  provider_service_id uuid
)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.provider_services ps
    join public.provider_profiles pp on pp.id = ps.provider_id
    join public.services s on s.id = ps.service_id
    where ps.id = provider_service_id
      and pp.verification_status = 'approved'
      and pp.stripe_account_id is not null
      and pp.stripe_transfers_active
      and pp.stripe_transfers_checked_at is not null
      and pp.service_zip is not null
      and cardinality(pp.availability_weekdays) > 0
      and pp.availability_start_local is not null
      and pp.availability_end_local is not null
      and ps.hourly_rate_cents between 2000 and 15000
      and s.is_live
      and private.has_current_master_agreement(pp.user_id, 'provider')
  );
$$;

comment on function public.is_provider_offering_hourly_bookable(uuid) is
  'Returns only whether one public offering satisfies hourly pilot readiness, including exact current provider legal acceptance. Never exposes the private reason or source fields.';

-- Keep the established implementations private and expose legal-gated wrappers
-- with the original public signatures. This scopes re-acceptance to real user
-- operations without changing trusted migration, reconciliation, or test-data
-- writes that preserve historical snapshots.

alter function public.create_hourly_booking_request(
  uuid, timestamptz, integer, integer, text, text, text, text, text,
  double precision, double precision
) rename to create_hourly_booking_request_unchecked;
alter function public.create_hourly_booking_request_unchecked(
  uuid, timestamptz, integer, integer, text, text, text, text, text,
  double precision, double precision
) set schema private;
revoke all on function private.create_hourly_booking_request_unchecked(
  uuid, timestamptz, integer, integer, text, text, text, text, text,
  double precision, double precision
) from public, anon, authenticated, service_role;

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

revoke all on function public.create_hourly_booking_request(
  uuid, timestamptz, integer, integer, text, text, text, text, text,
  double precision, double precision
) from public, anon, authenticated;
grant execute on function public.create_hourly_booking_request(
  uuid, timestamptz, integer, integer, text, text, text, text, text,
  double precision, double precision
) to authenticated;

alter function public.replace_hourly_booking_request(
  uuid, uuid, integer
) rename to replace_hourly_booking_request_unchecked;
alter function public.replace_hourly_booking_request_unchecked(
  uuid, uuid, integer
) set schema private;
revoke all on function private.replace_hourly_booking_request_unchecked(
  uuid, uuid, integer
) from public, anon, authenticated, service_role;

create function public.replace_hourly_booking_request(
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

revoke all on function public.replace_hourly_booking_request(
  uuid, uuid, integer
) from public, anon, authenticated;
grant execute on function public.replace_hourly_booking_request(
  uuid, uuid, integer
) to authenticated;

alter function public.begin_first_hour_payment(
  uuid, text
) rename to begin_first_hour_payment_unchecked;
alter function public.begin_first_hour_payment_unchecked(
  uuid, text
) set schema private;
revoke all on function private.begin_first_hour_payment_unchecked(
  uuid, text
) from public, anon, authenticated, service_role;

create function public.begin_first_hour_payment(
  p_booking_id uuid,
  p_authorization_version text
)
returns table (
  payment_id uuid,
  idempotency_key text,
  amount_cents integer,
  application_fee_cents integer
)
language plpgsql security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
begin
  if v_actor is null then
    raise exception 'AUTH_REQUIRED';
  end if;
  if not private.has_current_master_agreement(v_actor, 'customer') then
    raise exception 'LEGAL_ACCEPTANCE_REQUIRED';
  end if;
  if p_authorization_version is distinct from
    'hourly-v1-saved-method-2026-07-15' then
    raise exception 'AUTHORIZATION_VERSION_REQUIRED';
  end if;

  return query
  select result.payment_id, result.idempotency_key,
    result.amount_cents, result.application_fee_cents
  from private.begin_first_hour_payment_unchecked(
    p_booking_id,
    p_authorization_version
  ) as result;
end;
$$;

revoke all on function public.begin_first_hour_payment(uuid, text)
  from public, anon, authenticated;
grant execute on function public.begin_first_hour_payment(uuid, text)
  to authenticated;

comment on function public.create_hourly_booking_request(
  uuid, timestamptz, integer, integer, text, text, text, text, text,
  double precision, double precision
) is 'Creates a new hourly request only after exact current customer and provider legal acceptance, while snapshotting the published terms.';
comment on function public.replace_hourly_booking_request(
  uuid, uuid, integer
) is 'Replaces an eligible request only after exact current customer and provider legal acceptance.';
comment on function public.begin_first_hour_payment(uuid, text) is
  'Begins first-hour payment only after exact current customer legal acceptance and the published affirmative authorization version.';
