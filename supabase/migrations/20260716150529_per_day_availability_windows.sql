-- Per-day provider availability windows.
--
-- Replaces the single provider-wide weekly window (availability_weekdays +
-- availability_start_local/availability_end_local on provider_profiles) with
-- one row per weekday in provider_availability_windows. Day-groups in the UI
-- ("Mon-Thu 9-5, Fri-Sat 12-4") are a pure presentation concept: storage is
-- always one (provider_id, weekday) row.
--
-- The old three columns are DEPRECATED but kept in place (directory view,
-- column grants, and generated types still reference them); a follow-up
-- cleanup migration removes them from the view and revokes their grants.

-- 1. Table -------------------------------------------------------------------

create table public.provider_availability_windows (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null
    references public.provider_profiles (id) on delete cascade,
  weekday smallint not null,
  start_local time not null,
  end_local time not null,
  constraint provider_availability_windows_weekday_valid
    check (weekday between 0 and 6),
  constraint provider_availability_windows_window_valid
    check (start_local < end_local),
  constraint provider_availability_windows_one_per_day
    unique (provider_id, weekday)
);

comment on table public.provider_availability_windows is
  'One availability window per weekday per provider. Weekday encoded Monday=0 through Sunday=6, times local to America/Chicago.';
comment on column public.provider_availability_windows.weekday is
  'ISO-style weekday encoded Monday=0 through Sunday=6 in America/Chicago.';

-- 2. RLS + grants ------------------------------------------------------------
-- Reads: anyone can see approved providers'' windows (public storefront);
-- owners and admins can always see their own (needed during onboarding,
-- before approval). Writes: browser roles get NO write grants — all writes go
-- through the save_provider_availability RPC below. service_role keeps full
-- access for server-only paths and e2e seeds.

alter table public.provider_availability_windows enable row level security;

create policy "Public reads approved provider windows"
  on public.provider_availability_windows for select
  to anon, authenticated
  using (public.is_provider_approved(provider_id));

create policy "Owners and admins read own windows"
  on public.provider_availability_windows for select
  to authenticated
  using (public.owns_provider_profile(provider_id) or public.is_admin());

revoke all on table public.provider_availability_windows
  from public, anon, authenticated;
grant select on table public.provider_availability_windows
  to anon, authenticated;
grant all on table public.provider_availability_windows to service_role;

-- 3. Backfill from the deprecated single shared window ------------------------

insert into public.provider_availability_windows
  (provider_id, weekday, start_local, end_local)
select
  pp.id,
  unnest(pp.availability_weekdays),
  pp.availability_start_local,
  pp.availability_end_local
from public.provider_profiles pp
where cardinality(pp.availability_weekdays) > 0
  and pp.availability_start_local is not null
  and pp.availability_end_local is not null;

-- 4. Atomic save RPC ----------------------------------------------------------
-- Replace-all of the caller''s windows plus the availability profile fields in
-- one transaction, so a provider can never be stranded mid-save with zero
-- windows (which would flip their offerings unbookable).
-- p_windows: [{"weekday":0,"start":"09:00","end":"17:00"}, ...]

create function public.save_provider_availability(
  p_windows jsonb,
  p_availability_note text,
  p_service_zip text,
  p_minimum_notice_hours integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_provider uuid;
  v_count integer;
begin
  select pp.id into v_provider
  from public.provider_profiles pp
  where pp.user_id = (select auth.uid());
  if v_provider is null then
    raise exception 'PROVIDER_PROFILE_NOT_FOUND';
  end if;

  if p_windows is null or jsonb_typeof(p_windows) <> 'array' then
    raise exception 'INVALID_AVAILABILITY_WINDOWS';
  end if;
  v_count := jsonb_array_length(p_windows);
  if v_count < 1 or v_count > 7 then
    raise exception 'INVALID_AVAILABILITY_WINDOWS';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_windows) as w
    where jsonb_typeof(w->'weekday') <> 'number'
      or (w->>'weekday') !~ '^[0-6]$'
      or (w->>'start') is null
      or (w->>'start') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
      or (w->>'end') is null
      or (w->>'end') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
      or (w->>'start')::time >= (w->>'end')::time
  ) then
    raise exception 'INVALID_AVAILABILITY_WINDOWS';
  end if;
  if (
    select count(distinct (w->>'weekday')::smallint)
    from jsonb_array_elements(p_windows) as w
  ) <> v_count then
    raise exception 'INVALID_AVAILABILITY_WINDOWS';
  end if;

  delete from public.provider_availability_windows
  where provider_id = v_provider;

  insert into public.provider_availability_windows
    (provider_id, weekday, start_local, end_local)
  select
    v_provider,
    (w->>'weekday')::smallint,
    (w->>'start')::time,
    (w->>'end')::time
  from jsonb_array_elements(p_windows) as w;

  -- Existing column constraints (note moderation trigger, ZIP format,
  -- 3-168h notice) still apply to this update.
  update public.provider_profiles
  set
    availability_note = coalesce(p_availability_note, ''),
    service_zip = p_service_zip,
    minimum_notice_hours = p_minimum_notice_hours
  where id = v_provider;
end;
$$;

revoke all on function public.save_provider_availability(jsonb, text, text, integer)
  from public, anon, authenticated;
grant execute on function public.save_provider_availability(jsonb, text, text, integer)
  to authenticated;

comment on function public.save_provider_availability(jsonb, text, text, integer) is
  'Atomically replaces the calling provider''s per-day availability windows and updates note/ZIP/minimum notice. Sole write path for provider_availability_windows.';

-- 5a. assert_hourly_offering_slot: read the windows table -----------------------

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
      select 1
      from public.provider_availability_windows w
      where w.provider_id = pp.id
    )
    and ps.hourly_rate_cents between 2000 and 15000
    and s.is_live;

  if provider_id is null then
    raise exception 'OFFERING_NOT_BOOKABLE';
  end if;
  if p_expected_service_id is not null and service_id <> p_expected_service_id then
    raise exception 'REPLACEMENT_SERVICE_MISMATCH';
  end if;
  if nullif(btrim(provider_display_name), '') is null then
    raise exception 'PROVIDER_NAME_REQUIRED';
  end if;
  if p_scheduled_at < p_now + make_interval(hours => v_minimum_notice_hours) then
    raise exception 'MINIMUM_NOTICE_NOT_MET';
  end if;

  v_local_start := p_scheduled_at at time zone 'America/Chicago';
  v_local_end := (
    p_scheduled_at + make_interval(mins => p_estimated_minutes)
  ) at time zone 'America/Chicago';

  if v_local_start::date <> v_local_end::date
    or not exists (
      select 1
      from public.provider_availability_windows w
      where w.provider_id = assert_hourly_offering_slot.provider_id
        and w.weekday = extract(isodow from v_local_start)::integer - 1
        and v_local_start::time >= w.start_local
        and v_local_end::time <= w.end_local
    ) then
    raise exception 'OUTSIDE_PROVIDER_AVAILABILITY';
  end if;

  return next;
end;
$$;

-- 5b. hourly_replacement_candidate_ids: per-day window match -------------------

create or replace function public.hourly_replacement_candidate_ids(p_booking_id uuid)
returns table (provider_service_id uuid, provider_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_now timestamptz := statement_timestamp();
  v_booking public.bookings%rowtype;
  v_local_start timestamp;
  v_local_end timestamp;
begin
  select b.* into v_booking
  from public.bookings b
  where b.id = p_booking_id
    and b.booking_flow = 'hourly_v1'
    and b.customer_id = v_actor;
  if not found then
    raise exception 'BOOKING_NOT_FOUND';
  end if;
  if v_booking.status <> 'requested' or v_booking.scheduled_at <= v_now then
    return;
  end if;
  if v_now < v_booking.response_alert_at then
    raise exception 'REPLACEMENT_NOT_AVAILABLE_YET';
  end if;

  v_local_start := v_booking.scheduled_at at time zone 'America/Chicago';
  v_local_end := (
    v_booking.scheduled_at + make_interval(mins => v_booking.estimated_minutes)
  ) at time zone 'America/Chicago';

  return query
  select ps.id, pp.id
  from public.provider_services ps
  join public.provider_profiles pp on pp.id = ps.provider_id
  join public.services s on s.id = ps.service_id
  left join public.provider_ratings pr on pr.provider_id = pp.id
  where ps.service_id = v_booking.service_id
    and pp.id <> v_booking.provider_id
    and pp.verification_status = 'approved'
    and pp.stripe_account_id is not null
    and pp.stripe_transfers_active
    and pp.stripe_transfers_checked_at is not null
    and pp.service_zip is not null
    and ps.hourly_rate_cents between 2000 and 15000
    and s.is_live
    and v_booking.scheduled_at >=
      v_now + make_interval(hours => pp.minimum_notice_hours)
    and v_local_start::date = v_local_end::date
    and exists (
      select 1
      from public.provider_availability_windows w
      where w.provider_id = pp.id
        and w.weekday = extract(isodow from v_local_start)::integer - 1
        and v_local_start::time >= w.start_local
        and v_local_end::time <= w.end_local
    )
    and not private.provider_has_reserved_slot_conflict(
      pp.id,
      v_booking.scheduled_at,
      v_booking.estimated_minutes,
      null
    )
  order by
    (pp.service_zip = v_booking.job_zip) desc,
    coalesce(pr.avg_rating, 0) desc,
    ps.hourly_rate_cents,
    lower(pp.display_name),
    pp.id;
end;
$$;

-- 5c. rank_hourly_provider_ids: readiness = window rows exist ------------------

create or replace function public.rank_hourly_provider_ids(
  p_job_zip text,
  p_service_slug text default null
)
returns table (provider_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select pp.id
  from public.provider_profiles pp
  join public.provider_services ps on ps.provider_id = pp.id
  join public.services s on s.id = ps.service_id
  left join public.provider_ratings pr on pr.provider_id = pp.id
  where pp.verification_status = 'approved'
    and pp.stripe_account_id is not null
    and pp.stripe_transfers_active
    and pp.stripe_transfers_checked_at is not null
    and pp.service_zip is not null
    and exists (
      select 1
      from public.provider_availability_windows w
      where w.provider_id = pp.id
    )
    and ps.hourly_rate_cents between 2000 and 15000
    and s.is_live
    and (p_service_slug is null or s.slug = p_service_slug)
  group by pp.id, pp.service_zip, pp.display_name, pr.avg_rating
  order by
    (pp.service_zip = p_job_zip) desc,
    coalesce(pr.avg_rating, 0) desc,
    min(ps.hourly_rate_cents),
    lower(pp.display_name),
    pp.id;
$$;

-- 5d. is_provider_offering_hourly_bookable: readiness = window rows exist ------
-- Preserves the legal-acceptance gate added in 20260715230450.

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
      and exists (
        select 1
        from public.provider_availability_windows w
        where w.provider_id = pp.id
      )
      and ps.hourly_rate_cents between 2000 and 15000
      and s.is_live
      and private.has_current_master_agreement(pp.user_id, 'provider')
  );
$$;

comment on function public.is_provider_offering_hourly_bookable(uuid) is
  'Returns only whether one public offering satisfies hourly pilot readiness, including exact current provider legal acceptance. Never exposes the private reason or source fields.';

-- 6. Directory view: ADDITIVE change ------------------------------------------
-- Keeps the deprecated single-window columns during the transition (old code
-- keeps working) and appends availability_windows at the END — CREATE OR
-- REPLACE VIEW can only append output columns, not reorder or drop.

create or replace view public.public_provider_directory
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
    pp.created_at,
    pp.minimum_notice_hours,
    pp.company_name,
    pp.avatar_image_path,
    pp.banner_image_path,
    pp.banner_style,
    (
      select jsonb_agg(
        jsonb_build_object(
          'weekday', w.weekday,
          'start_local', w.start_local,
          'end_local', w.end_local
        )
        order by w.weekday
      )
      from public.provider_availability_windows w
      where w.provider_id = pp.id
    ) as availability_windows
  from public.provider_profiles pp
  where public.is_provider_approved(pp.id)
    and pp.avatar_image_path is not null;

revoke all on table public.public_provider_directory
  from public, anon, authenticated;
grant select on table public.public_provider_directory
  to anon, authenticated;

-- 7. Deprecation markers on the old columns ------------------------------------

comment on column public.provider_profiles.availability_weekdays is
  'DEPRECATED: superseded by provider_availability_windows. No longer written; kept during transition and dropped in a later cleanup migration.';
comment on column public.provider_profiles.availability_start_local is
  'DEPRECATED: superseded by provider_availability_windows. No longer written; kept during transition and dropped in a later cleanup migration.';
comment on column public.provider_profiles.availability_end_local is
  'DEPRECATED: superseded by provider_availability_windows. No longer written; kept during transition and dropped in a later cleanup migration.';;
