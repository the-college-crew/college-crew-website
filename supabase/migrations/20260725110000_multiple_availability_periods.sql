-- Several availability periods per day.
--
-- A student who works 9-12 before class and 4-8 after it could not say so: both
-- provider_availability_windows and provider_availability_overrides allowed
-- exactly one row per day. This drops those constraints and lets each weekday,
-- and each override date, carry several disjoint periods.
--
-- Nothing changes about booking. private.assert_hourly_offering_slot already
-- asks whether the slot fits inside ONE effective window, so a job still has to
-- be one contiguous block and can never straddle the gap between two periods.
--
-- Non-overlap is enforced in the save RPCs rather than by a constraint: both
-- tables revoke all write grants from the browser roles, so those functions are
-- the only way rows are ever written.

set lock_timeout = '10s';
set statement_timeout = '2min';

-- 1. Drop the one-per-day uniqueness ------------------------------------------

alter table public.provider_availability_windows
  drop constraint provider_availability_windows_one_per_day;

alter table public.provider_availability_overrides
  drop constraint provider_availability_overrides_one_per_date;

create index provider_availability_windows_provider_weekday_idx
  on public.provider_availability_windows (provider_id, weekday);

comment on table public.provider_availability_windows is
  'Availability periods per weekday per provider, several allowed and never overlapping. Weekday encoded Monday=0 through Sunday=6, times local to America/Chicago.';
comment on table public.provider_availability_overrides is
  'One-date exceptions that REPLACE the provider''s weekday periods for that local date (America/Chicago). A single is_available=false row closes the day; one or more is_available=true rows set custom periods. Dates with no row fall back to provider_availability_windows.';

-- 2. save_provider_availability: many periods per weekday ----------------------
-- Still a replace-all in one transaction, so a provider can never be stranded
-- mid-save with zero periods. p_windows stays
-- [{"weekday":0,"start":"09:00","end":"12:00"}, ...]; what changes is that a
-- weekday may now appear more than once, as long as its periods don't overlap.

create or replace function public.save_provider_availability(
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
  -- Up to four periods a day is far more than the pilot needs and still bounds
  -- the row count.
  if v_count < 1 or v_count > 28 then
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

  -- Two periods on the same weekday may sit end to end but must not overlap:
  -- overlapping periods make "which window does this booking fit in" ambiguous
  -- for no gain, since the union is expressible as one period.
  if exists (
    select 1
    from jsonb_array_elements(p_windows) as a
    join jsonb_array_elements(p_windows) as b
      on (a->>'weekday') = (b->>'weekday')
    where a <> b
      and (a->>'start')::time < (b->>'end')::time
      and (b->>'start')::time < (a->>'end')::time
  ) then
    raise exception 'OVERLAPPING_AVAILABILITY_WINDOWS';
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

  update public.provider_profiles
  set
    availability_note = coalesce(p_availability_note, ''),
    service_zip = p_service_zip,
    -- Pilot: minimum notice is fixed platform-wide, not a per-provider control.
    minimum_notice_hours = 12
  where id = v_provider;
end;
$$;

-- 3. Override writes: replace all of one date's periods ------------------------
-- The old (date, boolean, start, end) signature can only express one period, so
-- it's replaced by a periods array. Dropping it rather than overloading keeps
-- PostgREST from having to pick between two candidates.

drop function if exists public.save_provider_availability_override(
  date, boolean, time, time
);

create function public.save_provider_availability_override(
  p_local_date date,
  p_is_available boolean,
  p_periods jsonb default '[]'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_provider uuid;
  v_today date := (statement_timestamp() at time zone 'America/Chicago')::date;
  v_count integer;
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

  if not p_is_available then
    -- Closed: exactly one marker row, no periods.
    delete from public.provider_availability_overrides
    where provider_id = v_provider and local_date = p_local_date;
    insert into public.provider_availability_overrides
      (provider_id, local_date, is_available, start_local, end_local)
    values (v_provider, p_local_date, false, null, null);
    return;
  end if;

  if p_periods is null or jsonb_typeof(p_periods) <> 'array' then
    raise exception 'INVALID_OVERRIDE_WINDOW';
  end if;
  v_count := jsonb_array_length(p_periods);
  if v_count < 1 or v_count > 4 then
    raise exception 'INVALID_OVERRIDE_WINDOW';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_periods) as w
    where (w->>'start') is null
      or (w->>'start') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
      or (w->>'end') is null
      or (w->>'end') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
      or (w->>'start')::time >= (w->>'end')::time
  ) then
    raise exception 'INVALID_OVERRIDE_WINDOW';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_periods) as a
    join jsonb_array_elements(p_periods) as b on true
    where a <> b
      and (a->>'start')::time < (b->>'end')::time
      and (b->>'start')::time < (a->>'end')::time
  ) then
    raise exception 'OVERLAPPING_AVAILABILITY_WINDOWS';
  end if;

  delete from public.provider_availability_overrides
  where provider_id = v_provider and local_date = p_local_date;

  insert into public.provider_availability_overrides
    (provider_id, local_date, is_available, start_local, end_local)
  select v_provider, p_local_date, true, (w->>'start')::time, (w->>'end')::time
  from jsonb_array_elements(p_periods) as w;
end;
$$;

revoke all on function public.save_provider_availability_override(date, boolean, jsonb)
  from public, anon, authenticated;
grant execute on function public.save_provider_availability_override(date, boolean, jsonb)
  to authenticated;

comment on function public.save_provider_availability_override(date, boolean, jsonb) is
  'Replaces one local date''s periods for the calling provider: closed outright, or one to four non-overlapping custom periods. Sole write path for provider_availability_overrides.';

-- 4. Resolver: unchanged in shape, now genuinely multi-row ---------------------
-- The body already returned a set; re-stated here only to update the comment,
-- since "the effective window" is now "the effective windows".

comment on function private.provider_effective_window(uuid, date) is
  'Every period a provider is open for on one local date, in order. An override date replaces the weekday periods entirely; no rows means closed. A booking must fit inside a single row, so it can never straddle a gap.';
