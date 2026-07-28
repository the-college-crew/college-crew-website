-- Provider availability is independent of verification. A student can pause
-- their listing without losing their approved status or onboarding progress;
-- founders can also impose a lock that the provider cannot override.
alter table public.provider_profiles
  add column is_active boolean not null default true,
  add column admin_forced_inactive boolean not null default false;

comment on column public.provider_profiles.is_active is
  'Provider listing preference. False removes the provider from public discovery and new-booking eligibility.';
comment on column public.provider_profiles.admin_forced_inactive is
  'Founder-only safety/operations lock. When true, the provider remains unavailable even if is_active is true.';

-- Own-profile reads use the authenticated, RLS-scoped client. These fields are
-- not client-writable; the public can never see a false value because inactive
-- rows fail the policy below.
grant select (is_active, admin_forced_inactive)
  on table public.provider_profiles to authenticated;

-- Keep base-table access private to the provider/admin, and expose a provider
-- publicly only while their verification and effective activity are both live.
drop policy "Approved providers are public; owners and admins see all"
  on public.provider_profiles;

create policy "Active approved providers are public; owners and admins see all"
  on public.provider_profiles for select to anon, authenticated
  using (
    (
      verification_status = 'approved'
      and is_active
      and not admin_forced_inactive
    )
    or user_id = auth.uid()
    or public.is_admin()
  );

-- This existing predicate gates public provider views, availability reads, and
-- scheduling. Preserve its public API but make "approved" mean effectively
-- active as well as founder-approved.
create or replace function public.is_provider_approved(provider_profile_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.provider_profiles
    where id = provider_profile_id
      and verification_status = 'approved'
      and is_active
      and not admin_forced_inactive
  );
$$;

-- New hourly requests, counter-offers, and replacements call this helper.
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
      and pp.is_active
      and not pp.admin_forced_inactive
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
      and private.has_current_legal_document(pp.user_id, 'platform_terms')
      and private.has_current_legal_document(pp.user_id, 'provider_terms')
  );
$$;

-- Quote booking uses its own readiness helper, so apply the same effective
-- activity gate there too.
create or replace function public.is_provider_offering_quote_bookable(
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
      and ps.pricing_mode = 'quote'
      and ps.hourly_rate_cents is null
      and s.slug in ('hauling', 'pressure-washing', 'window-washing')
      and s.is_live
      and pp.verification_status = 'approved'
      and pp.is_active
      and not pp.admin_forced_inactive
      and pp.stripe_account_id is not null
      and pp.stripe_transfers_active
      and pp.stripe_transfers_checked_at is not null
      and pp.service_zip is not null
      and exists (
        select 1 from public.provider_availability_windows w
        where w.provider_id = pp.id
      )
      and private.has_current_legal_document(pp.user_id, 'platform_terms')
      and private.has_current_legal_document(pp.user_id, 'provider_terms')
  );
$$;

-- The hourly slot guard is the final booking path for requests, acceptances,
-- counter-offers, and replacements. It must reject a provider paused after a
-- request was created, without changing any completed or in-progress booking.
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
language plpgsql security definer
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

  select ps.provider_id, ps.service_id, ps.hourly_rate_cents,
    pp.display_name, s.name, pp.minimum_notice_hours
  into provider_id, service_id, hourly_rate_cents,
    provider_display_name, service_name, v_minimum_notice_hours
  from public.provider_services ps
  join public.provider_profiles pp on pp.id = ps.provider_id
  join public.services s on s.id = ps.service_id
  where ps.id = p_provider_service_id
    and pp.verification_status = 'approved'
    and pp.is_active
    and not pp.admin_forced_inactive
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
  if p_scheduled_at < p_now + make_interval(hours => v_minimum_notice_hours) then
    raise exception 'MINIMUM_NOTICE_NOT_MET';
  end if;

  v_local_start := p_scheduled_at at time zone 'America/Chicago';
  v_local_end := (p_scheduled_at + make_interval(mins => p_estimated_minutes))
    at time zone 'America/Chicago';
  if v_local_start::date <> v_local_end::date or not exists (
    select 1
    from private.provider_effective_window(provider_id, v_local_start::date) ew
    where v_local_start::time >= ew.start_local
      and v_local_end::time <= ew.end_local
  ) then
    raise exception 'OUTSIDE_PROVIDER_AVAILABILITY';
  end if;

  return next;
end;
$$;

-- Replacement suggestions are also public booking entry points. Do not surface
-- paused or founder-locked providers as alternatives.
create or replace function public.hourly_replacement_candidate_ids(p_booking_id uuid)
returns table(provider_service_id uuid, provider_id uuid)
language plpgsql security definer
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
  if not found then raise exception 'BOOKING_NOT_FOUND'; end if;
  if v_booking.status not in ('requested', 'declined', 'cancelled')
    or v_booking.scheduled_at <= v_now then return; end if;
  if v_booking.status = 'cancelled'
    and v_booking.cancelled_by_role is distinct from 'provider' then return; end if;
  if v_booking.status = 'requested' and v_now < v_booking.response_alert_at then
    raise exception 'REPLACEMENT_NOT_AVAILABLE_YET';
  end if;

  v_local_start := v_booking.scheduled_at at time zone 'America/Chicago';
  v_local_end := (v_booking.scheduled_at + make_interval(mins => v_booking.estimated_minutes))
    at time zone 'America/Chicago';
  return query
  select ps.id, pp.id
  from public.provider_services ps
  join public.provider_profiles pp on pp.id = ps.provider_id
  join public.services s on s.id = ps.service_id
  left join public.provider_ratings pr on pr.provider_id = pp.id
  where ps.service_id = v_booking.service_id
    and pp.id <> v_booking.provider_id
    and pp.verification_status = 'approved'
    and pp.is_active
    and not pp.admin_forced_inactive
    and pp.stripe_account_id is not null
    and pp.stripe_transfers_active
    and pp.stripe_transfers_checked_at is not null
    and pp.service_zip is not null
    and ps.hourly_rate_cents between 2000 and 15000
    and s.is_live
    and v_booking.scheduled_at >= v_now + make_interval(hours => pp.minimum_notice_hours)
    and v_local_start::date = v_local_end::date
    and exists (
      select 1 from private.provider_effective_window(pp.id, v_local_start::date) ew
      where v_local_start::time >= ew.start_local and v_local_end::time <= ew.end_local
    )
    and not private.provider_has_reserved_slot_conflict(
      pp.id, v_booking.scheduled_at, v_booking.estimated_minutes, null
    )
  order by (pp.service_zip = v_booking.job_zip) desc, coalesce(pr.avg_rating, 0) desc,
    ps.hourly_rate_cents, lower(pp.display_name), pp.id;
end;
$$;

create or replace function public.hourly_replacement_time_shift_ids(p_booking_id uuid)
returns table(provider_service_id uuid, provider_id uuid, suggested_start_at timestamptz)
language plpgsql security definer
set search_path = ''
as $$
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
  select b.* into v_booking from public.bookings b
  where b.id = p_booking_id and b.booking_flow = 'hourly_v1' and b.customer_id = v_actor;
  if not found then raise exception 'BOOKING_NOT_FOUND'; end if;
  if v_booking.status not in ('requested', 'declined', 'cancelled')
    or v_booking.scheduled_at <= v_now then return; end if;
  if v_booking.status = 'cancelled'
    and v_booking.cancelled_by_role is distinct from 'provider' then return; end if;
  if v_booking.status = 'requested' and v_now < v_booking.response_alert_at then
    raise exception 'REPLACEMENT_NOT_AVAILABLE_YET';
  end if;
  if v_booking.estimated_minutes is null or v_booking.time_flexibility = 'fixed' then return; end if;

  v_requested_date := (v_booking.scheduled_at at time zone 'America/Chicago')::date;
  return query
  with eligible as (
    select ps.id as provider_service_id, pp.id as provider_id,
      pp.minimum_notice_hours, ps.hourly_rate_cents,
      coalesce(pr.avg_rating, 0) as avg_rating, lower(pp.display_name) as sort_name
    from public.provider_services ps
    join public.provider_profiles pp on pp.id = ps.provider_id
    join public.services s on s.id = ps.service_id
    left join public.provider_ratings pr on pr.provider_id = pp.id
    where ps.service_id = v_booking.service_id
      and pp.id <> v_booking.provider_id
      and pp.verification_status = 'approved'
      and pp.is_active
      and not pp.admin_forced_inactive
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
    select e.provider_service_id, e.provider_id, ranked.start_at
    from (
      select slot.start_at
      from (
        select generate_series(
          (v_requested_date - c_days_before)::timestamp,
          (v_requested_date + c_days_after)::timestamp,
          interval '1 day'
        )::date as local_date
      ) day
      cross join lateral private.provider_effective_window(e.provider_id, day.local_date) w
      cross join lateral generate_series(
        0,
        greatest(0, ((extract(epoch from (w.end_local - w.start_local))::integer / 60)
          - v_booking.estimated_minutes) / c_step_minutes)
      ) step(n)
      cross join lateral (
        select ((day.local_date + w.start_local)
          + make_interval(mins => step.n * c_step_minutes))
          at time zone 'America/Chicago' as start_at
      ) slot
      where w.start_local + make_interval(mins => v_booking.estimated_minutes) <= w.end_local
        and slot.start_at <> v_booking.scheduled_at
        and slot.start_at >= v_now + make_interval(hours => e.minimum_notice_hours)
      order by abs(extract(epoch from (slot.start_at - v_booking.scheduled_at)))
      offset 0
    ) ranked
    where not private.provider_has_reserved_slot_conflict(
      e.provider_id, ranked.start_at, v_booking.estimated_minutes, null
    )
    limit 1
  ) best
  where not exists (
    select 1 from public.hourly_replacement_candidate_ids(p_booking_id) t1
    where t1.provider_service_id = best.provider_service_id
  )
  order by abs(extract(epoch from (best.start_at - v_booking.scheduled_at))),
    e.avg_rating desc, e.hourly_rate_cents, e.sort_name, e.provider_id
  limit c_max_rows;
end;
$$;
