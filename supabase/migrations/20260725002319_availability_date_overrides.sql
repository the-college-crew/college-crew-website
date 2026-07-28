-- Per-date availability overrides + calendar read RPCs.
--
-- The weekly model (provider_availability_windows, one window per weekday) can't
-- say "closed on March 14" or "that Saturday I can only work 8-11". This adds a
-- per-date override that REPLACES the weekday window for one local date, plus a
-- single resolver every guard routes through, so the fallback rule lives in one
-- place instead of being re-inlined in each function.
--
-- Also adds the two read RPCs the booking calendar needs: the open window per
-- day over a date range, and the provider's reserved time ranges (times only,
-- no job details).

set lock_timeout = '10s';
set statement_timeout = '2min';

-- 1. Table --------------------------------------------------------------------
-- Deliberately no free-text note column: these rows are publicly readable for
-- approved providers, and a public UGC field would need the same moderation
-- trigger availability_note carries. Overrides stay purely structural.

create table public.provider_availability_overrides (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null
    references public.provider_profiles (id) on delete cascade,
  local_date date not null,
  is_available boolean not null,
  start_local time,
  end_local time,
  created_at timestamptz not null default now(),
  constraint provider_availability_overrides_one_per_date
    unique (provider_id, local_date),
  constraint provider_availability_overrides_shape_valid check (
    (is_available = false and start_local is null and end_local is null)
    or (
      is_available = true
      and start_local is not null
      and end_local is not null
      and start_local < end_local
    )
  )
);

comment on table public.provider_availability_overrides is
  'One-date exceptions that REPLACE the provider''s weekday window for that local date (America/Chicago). is_available=false closes the day outright; is_available=true sets custom hours. Dates with no row fall back to provider_availability_windows.';

create index provider_availability_overrides_lookup_idx
  on public.provider_availability_overrides (provider_id, local_date);

-- 2. RLS + grants -------------------------------------------------------------
-- Mirrors provider_availability_windows exactly: public read for approved
-- providers, owner/admin read always, NO browser write grants (writes go
-- through the RPCs below).

alter table public.provider_availability_overrides enable row level security;

create policy "Public reads approved provider overrides"
  on public.provider_availability_overrides for select
  to anon, authenticated
  using (public.is_provider_approved(provider_id));

create policy "Owners and admins read own overrides"
  on public.provider_availability_overrides for select
  to authenticated
  using (public.owns_provider_profile(provider_id) or public.is_admin());

revoke all on table public.provider_availability_overrides
  from public, anon, authenticated;
grant select on table public.provider_availability_overrides
  to anon, authenticated;
grant all on table public.provider_availability_overrides to service_role;

-- 3. The resolver -------------------------------------------------------------
-- Returns 0 or 1 rows: the effective open window for one provider on one local
-- date. Zero rows means the provider is closed that day, whether because an
-- override closed it or because the weekday has no window at all.

create function private.provider_effective_window(
  p_provider_id uuid,
  p_local_date date
)
returns table (start_local time, end_local time)
language sql
stable
set search_path = ''
as $$
  select o.start_local, o.end_local
  from public.provider_availability_overrides o
  where o.provider_id = p_provider_id
    and o.local_date = p_local_date
    and o.is_available
  union all
  select w.start_local, w.end_local
  from public.provider_availability_windows w
  where w.provider_id = p_provider_id
    and w.weekday = extract(isodow from p_local_date)::integer - 1
    and not exists (
      select 1
      from public.provider_availability_overrides o
      where o.provider_id = p_provider_id
        and o.local_date = p_local_date
    );
$$;

comment on function private.provider_effective_window(uuid, date) is
  'The single source of truth for "is this provider open on this local date, and between what hours". An override row replaces the weekday window entirely; no row means closed.';

revoke execute on function private.provider_effective_window(uuid, date)
  from public, anon, authenticated, service_role;

-- 4. Guards rewritten to use the resolver -------------------------------------

-- 4a. assert_hourly_offering_slot: covers request, accept, counter-offer, and
-- replace, since they all funnel through it. Only the availability lookup
-- changes; every other check is carried over verbatim from
-- 20260716150529_per_day_availability_windows.sql.
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

-- 4b. Tier-1 replacement candidates. Carried over verbatim from
-- 20260724140000_my_bookings_upgrade.sql apart from the availability lookup.
create or replace function public.hourly_replacement_candidate_ids(p_booking_id uuid)
 returns table(provider_service_id uuid, provider_id uuid)
 language plpgsql
 security definer
 set search_path to ''
as $function$
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
  if v_booking.status not in ('requested', 'declined', 'cancelled')
    or v_booking.scheduled_at <= v_now then
    return;
  end if;
  if v_booking.status = 'cancelled'
    and v_booking.cancelled_by_role is distinct from 'provider' then
    return;
  end if;
  if v_booking.status = 'requested' and v_now < v_booking.response_alert_at then
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
      from private.provider_effective_window(pp.id, v_local_start::date) ew
      where v_local_start::time >= ew.start_local
        and v_local_end::time <= ew.end_local
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
$function$;

-- 4c. Tier-2 nearest-alternative-start suggestions. Carried over verbatim from
-- 20260724140000_my_bookings_upgrade.sql apart from the slot generator's window
-- source, which becomes the resolver so a closed date drops out of the search.
create or replace function public.hourly_replacement_time_shift_ids(p_booking_id uuid)
 returns table(
   provider_service_id uuid,
   provider_id uuid,
   suggested_start_at timestamptz
 )
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_actor uuid := (select auth.uid());
  v_now timestamptz := statement_timestamp();
  v_booking public.bookings%rowtype;
  v_requested_date date;
  c_days_before constant integer := 3;
  c_days_after constant integer := 7;
  c_step_minutes constant integer := 30;
  c_max_rows constant integer := 10;
begin
  select b.* into v_booking
  from public.bookings b
  where b.id = p_booking_id
    and b.booking_flow = 'hourly_v1'
    and b.customer_id = v_actor;
  if not found then
    raise exception 'BOOKING_NOT_FOUND';
  end if;
  if v_booking.status not in ('requested', 'declined', 'cancelled')
    or v_booking.scheduled_at <= v_now then
    return;
  end if;
  if v_booking.status = 'cancelled'
    and v_booking.cancelled_by_role is distinct from 'provider' then
    return;
  end if;
  if v_booking.status = 'requested' and v_now < v_booking.response_alert_at then
    raise exception 'REPLACEMENT_NOT_AVAILABLE_YET';
  end if;
  if v_booking.estimated_minutes is null then
    return;
  end if;
  if v_booking.time_flexibility = 'fixed' then
    return;
  end if;

  v_requested_date := (v_booking.scheduled_at at time zone 'America/Chicago')::date;

  return query
  with eligible as (
    select
      ps.id as provider_service_id,
      pp.id as provider_id,
      pp.minimum_notice_hours,
      ps.hourly_rate_cents,
      coalesce(pr.avg_rating, 0) as avg_rating,
      lower(pp.display_name) as sort_name
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
  )
  select best.provider_service_id, best.provider_id, best.start_at
  from eligible e
  cross join lateral (
    select
      e.provider_service_id,
      e.provider_id,
      ranked.start_at
    from (
      -- Every workable start in the window, cheapest filters only, ordered by
      -- distance from the requested time. `offset 0` fences this subquery so
      -- the conflict check below runs on the nearest slots first and stops at
      -- the first hit, instead of being evaluated across the whole scan.
      select
        slot.start_at
      from (
        select generate_series(
          (v_requested_date - c_days_before)::timestamp,
          (v_requested_date + c_days_after)::timestamp,
          interval '1 day'
        )::date as local_date
      ) as day
      cross join lateral private.provider_effective_window(
        e.provider_id, day.local_date
      ) w
      cross join lateral generate_series(
        0,
        greatest(
          0,
          (
            (extract(epoch from (w.end_local - w.start_local))::integer / 60)
            - v_booking.estimated_minutes
          ) / c_step_minutes
        )
      ) as step(n)
      cross join lateral (
        select (
          (day.local_date + w.start_local)
          + make_interval(mins => step.n * c_step_minutes)
        ) at time zone 'America/Chicago' as start_at
      ) slot
      where w.start_local + make_interval(mins => v_booking.estimated_minutes)
              <= w.end_local
        and slot.start_at <> v_booking.scheduled_at
        and slot.start_at >= v_now + make_interval(hours => e.minimum_notice_hours)
      order by abs(extract(epoch from (slot.start_at - v_booking.scheduled_at)))
      offset 0
    ) ranked
    where not private.provider_has_reserved_slot_conflict(
      e.provider_id,
      ranked.start_at,
      v_booking.estimated_minutes,
      null
    )
    limit 1
  ) best
  -- A provider who can make the original slot is a tier-1 result, not this.
  where not exists (
    select 1
    from public.hourly_replacement_candidate_ids(p_booking_id) t1
    where t1.provider_service_id = best.provider_service_id
  )
  order by
    abs(extract(epoch from (best.start_at - v_booking.scheduled_at))),
    e.avg_rating desc,
    e.hourly_rate_cents,
    e.sort_name,
    e.provider_id
  limit c_max_rows;
end;
$function$;

-- 5. Override write RPCs ------------------------------------------------------
-- Sole write path for provider_availability_overrides, matching how
-- save_provider_availability owns provider_availability_windows.

create function public.save_provider_availability_override(
  p_local_date date,
  p_is_available boolean,
  p_start time default null,
  p_end time default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_provider uuid;
  v_today date := (statement_timestamp() at time zone 'America/Chicago')::date;
begin
  select pp.id into v_provider
  from public.provider_profiles pp
  where pp.user_id = (select auth.uid());
  if v_provider is null then
    raise exception 'PROVIDER_PROFILE_NOT_FOUND';
  end if;

  if p_local_date is null
    or p_local_date < v_today
    or p_local_date > v_today + 365 then
    raise exception 'INVALID_OVERRIDE_DATE';
  end if;
  if p_is_available is null then
    raise exception 'INVALID_OVERRIDE_WINDOW';
  end if;
  if p_is_available then
    if p_start is null or p_end is null or p_start >= p_end then
      raise exception 'INVALID_OVERRIDE_WINDOW';
    end if;
  elsif p_start is not null or p_end is not null then
    raise exception 'INVALID_OVERRIDE_WINDOW';
  end if;

  insert into public.provider_availability_overrides
    (provider_id, local_date, is_available, start_local, end_local)
  values (
    v_provider,
    p_local_date,
    p_is_available,
    case when p_is_available then p_start end,
    case when p_is_available then p_end end
  )
  on conflict (provider_id, local_date) do update
  set
    is_available = excluded.is_available,
    start_local = excluded.start_local,
    end_local = excluded.end_local;
end;
$$;

revoke all on function public.save_provider_availability_override(date, boolean, time, time)
  from public, anon, authenticated;
grant execute on function public.save_provider_availability_override(date, boolean, time, time)
  to authenticated;

comment on function public.save_provider_availability_override(date, boolean, time, time) is
  'Closes one local date or gives it custom hours for the calling provider. Sole write path for provider_availability_overrides.';

create function public.clear_provider_availability_override(p_local_date date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_provider uuid;
begin
  select pp.id into v_provider
  from public.provider_profiles pp
  where pp.user_id = (select auth.uid());
  if v_provider is null then
    raise exception 'PROVIDER_PROFILE_NOT_FOUND';
  end if;

  delete from public.provider_availability_overrides
  where provider_id = v_provider
    and local_date = p_local_date;
end;
$$;

revoke all on function public.clear_provider_availability_override(date)
  from public, anon, authenticated;
grant execute on function public.clear_provider_availability_override(date)
  to authenticated;

comment on function public.clear_provider_availability_override(date) is
  'Drops one date''s override so it falls back to the provider''s usual weekday hours.';

-- 6. Calendar read RPCs -------------------------------------------------------

create function public.provider_schedule_days(
  p_provider_id uuid,
  p_from date,
  p_to date
)
returns table (local_date date, start_local time, end_local time)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_from is null or p_to is null or p_to < p_from then
    raise exception 'INVALID_DATE_RANGE';
  end if;
  if p_to - p_from > 120 then
    raise exception 'DATE_RANGE_TOO_WIDE';
  end if;
  if not (
    public.is_provider_approved(p_provider_id)
    or public.owns_provider_profile(p_provider_id)
    or public.is_admin()
  ) then
    return;
  end if;

  return query
  select day.d::date, ew.start_local, ew.end_local
  from generate_series(p_from, p_to, interval '1 day') as day(d)
  cross join lateral private.provider_effective_window(
    p_provider_id, day.d::date
  ) ew
  order by day.d;
end;
$$;

revoke all on function public.provider_schedule_days(uuid, date, date)
  from public, anon, authenticated;
grant execute on function public.provider_schedule_days(uuid, date, date)
  to authenticated;

comment on function public.provider_schedule_days(uuid, date, date) is
  'The provider''s open window per local date across a range (max 120 days), with per-date overrides already applied. Days the provider is closed are omitted.';

-- Times only: no booking id, no customer, no service. Enough for a calendar to
-- grey out taken slots, nothing more. The status list matches
-- private.provider_has_reserved_slot_conflict exactly, so the calendar never
-- shows a slot as taken that the server would still accept — `requested`
-- bookings deliberately do not reserve, since the conflict check runs at accept
-- time and first accept wins.
create function public.provider_busy_intervals(
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
  if p_to - p_from > interval '120 days' then
    raise exception 'DATE_RANGE_TOO_WIDE';
  end if;
  if not (
    public.is_provider_approved(p_provider_id)
    or public.owns_provider_profile(p_provider_id)
    or public.is_admin()
  ) then
    return;
  end if;

  return query
  select
    b.scheduled_at,
    b.scheduled_at + make_interval(mins => coalesce(b.estimated_minutes, 60))
  from public.bookings b
  where b.provider_id = p_provider_id
    and b.status in (
      'accepted', 'paid', 'booked', 'in_progress', 'invoice_review', 'disputed'
    )
    and b.scheduled_at < p_to
    and b.scheduled_at + make_interval(mins => coalesce(b.estimated_minutes, 60))
      > p_from
  order by b.scheduled_at;
end;
$$;

revoke all on function public.provider_busy_intervals(uuid, timestamptz, timestamptz)
  from public, anon, authenticated;
grant execute on function public.provider_busy_intervals(uuid, timestamptz, timestamptz)
  to authenticated;

comment on function public.provider_busy_intervals(uuid, timestamptz, timestamptz) is
  'Reserved time ranges for a provider, times only and no job details. Status list mirrors private.provider_has_reserved_slot_conflict.';
