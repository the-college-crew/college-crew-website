-- Widen the calendar read cap from 120 days to 400.
--
-- provider_schedule_days and provider_busy_intervals were capped at 120 days as
-- a bound on how much work one call can ask for. Two callers legitimately need
-- more, and both were failing outright:
--
--   /account "Specific dates"  asks for 364 days.
--   /provider/dashboard        asks for 30 back + 90 forward; the days call is
--                              exactly 120, but the busy call covers the last
--                              local day in full and so spans 121.
--
-- getProviderSchedule returns an EMPTY schedule when either call errors, so the
-- provider's own calendar rendered "No availability" on every date while
-- customers booking the same provider saw the real hours. 400 days keeps the
-- bound meaningful (overrides can only be set a year out) and covers both.
--
-- Bodies are otherwise byte-identical to 20260725100000_availability_date_overrides.sql.

set lock_timeout = '10s';
set statement_timeout = '2min';

create or replace function public.provider_schedule_days(
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
  if p_to - p_from > 400 then
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

comment on function public.provider_schedule_days(uuid, date, date) is
  'The provider''s open window per local date across a range (max 400 days), with per-date overrides already applied. Days the provider is closed are omitted.';

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

comment on function public.provider_busy_intervals(uuid, timestamptz, timestamptz) is
  'Reserved time ranges for a provider (max 400 days), times only and no job details. Status list mirrors private.provider_has_reserved_slot_conflict.';
