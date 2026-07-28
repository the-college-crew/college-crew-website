-- My bookings upgrade.
--
-- The customer dashboard accumulated items it had no way to resolve: review
-- prompts never went away, and a provider-cancelled booking sat in "Needs
-- attention" forever because dismiss_booking only accepted declined requests.
-- Quick-book suggestions also went dark for a cancellation, which is exactly
-- when a customer most needs a replacement.
--
-- This migration:
--   1. Widens dismiss_booking to every terminal state a customer can clear.
--   2. Adds a SEPARATE review-prompt dismissal, so skipping a review never
--      hides the job itself from the Past tab.
--   3. Opens replacement suggestions to a provider-cancelled booking.
--   4. Adds a second suggestion tier: providers who can't make the original
--      slot, with their nearest alternative start time.
--   5. Lets a replacement draft descend from a provider-cancelled original.

-- 1) dismiss_booking: any terminal state the customer can clear ---------------
-- 'countered' is deliberately excluded: it needs an accept/decline decision,
-- not a dismissal. Synthetic 'expired' (a still-'requested' row past its start)
-- is excluded too — the dashboard files those under Past with no dismiss.
create or replace function public.dismiss_booking(p_booking_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
begin
  update public.bookings
  set dismissed_at = statement_timestamp()
  where id = p_booking_id
    and customer_id = v_actor
    and status in ('declined', 'cancelled', 'expired', 'withdrawn')
    and dismissed_at is null;
  if not found then
    raise exception 'BOOKING_NOT_DISMISSIBLE';
  end if;
  return p_booking_id;
end;
$$;

comment on function public.dismiss_booking(uuid) is
  'Customer clears a terminal booking from Needs attention. The row stays visible under Past — dismissal is not deletion.';

-- 2) Review-prompt dismissal --------------------------------------------------
-- Intentionally NOT bookings.dismissed_at: skipping a review must not hide a
-- completed job (and its payment record) from the Past tab.
alter table public.bookings
  add column if not exists review_prompt_dismissed_at timestamptz;

comment on column public.bookings.review_prompt_dismissed_at is
  'Customer skipped the "How did the job go?" prompt. The booking stays in Past and remains reviewable; only the prompt is suppressed.';

create or replace function public.dismiss_review_prompt(p_booking_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
begin
  update public.bookings
  set review_prompt_dismissed_at = statement_timestamp()
  where id = p_booking_id
    and customer_id = v_actor
    and status = 'completed'
    and review_prompt_dismissed_at is null;
  if not found then
    raise exception 'REVIEW_PROMPT_NOT_DISMISSIBLE';
  end if;
  return p_booking_id;
end;
$$;

revoke all on function public.dismiss_review_prompt(uuid) from public, anon;
grant execute on function public.dismiss_review_prompt(uuid) to authenticated;

-- 3) Tier 1 suggestions: also serve a provider-cancelled booking --------------
-- Recreated from the live definition (see 20260723120000 for why); only the
-- status/timing gate changes. A customer-cancelled booking is excluded: they
-- called it off, so the dashboard never offers to rebook it for them.
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
  -- Surface alternatives for a timed-out request (still 'requested', past its
  -- response window), a declined one, or one the provider cancelled. A
  -- past-start job never does.
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
$function$;

-- 4) Tier 2 suggestions: nearest alternative start time -----------------------
-- When nobody is free at the original slot, the customer would otherwise see an
-- empty list and have to rebuild the whole request by hand. This returns each
-- eligible provider's single closest workable start to the time they asked for,
-- so the UI can offer them with an explicit "the time would change" warning.
--
-- Eligibility mirrors tier 1 exactly (approved, payout-ready, live service,
-- rate band, honors the provider's own minimum notice, no reserved-slot
-- conflict). Only the slot search differs. Providers who CAN make the original
-- time are excluded — they belong to tier 1.
--
-- Suppressed entirely when the customer chose 'fixed' ("this time only"). They
-- said the time is the constraint, so offering students who can't make it is
-- noise — the answer for them is a different student at their time, or nothing.
-- Gating here rather than in the UI means the dashboard, the replacement page,
-- and the server-side `at` validation all inherit the rule from one place.
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
  -- Search window around the requested time, and the slot granularity. Wide
  -- enough to find a real alternative, tight enough that the scan stays small.
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
  -- "This time only": the customer ruled out a different time up front, so a
  -- student who can't make their slot is not a suggestion worth showing.
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
      join public.provider_availability_windows w
        on w.provider_id = e.provider_id
       and w.weekday = extract(isodow from day.local_date)::integer - 1
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

revoke all on function public.hourly_replacement_time_shift_ids(uuid)
  from public, anon;
grant execute on function public.hourly_replacement_time_shift_ids(uuid)
  to authenticated;

comment on function public.hourly_replacement_time_shift_ids(uuid) is
  'Tier-2 replacement suggestions: eligible providers who cannot make the original slot, each with their nearest workable start time. Ordered by closeness to the requested time; the app layer picks a diversified shortlist.';

-- 5) A replacement may descend from a provider-cancelled original -------------
-- Same authorization boundary as before, plus 'cancelled'. The finalize step's
-- withdraw stays scoped to 'requested' — a cancelled original is already
-- terminal and must keep its cancelled status (and its refund record).
create or replace function public.create_booking_draft(
  p_booking_id uuid,
  p_provider_service_id uuid,
  p_scheduled_at timestamptz,
  p_estimated_minutes integer,
  p_details text,
  p_address text,
  p_job_zip text,
  p_address_kind text,
  p_service_city text,
  p_on_decline_preference public.booking_decline_preference,
  p_hourly_rate_cents integer,
  p_stripe_payment_intent_id text,
  p_stripe_customer_id text,
  p_latitude double precision DEFAULT NULL,
  p_longitude double precision DEFAULT NULL,
  p_original_booking_id uuid DEFAULT NULL
)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_actor uuid := (select auth.uid());
begin
  if v_actor is null then raise exception 'AUTH_REQUIRED'; end if;

  -- A replacement's original must be the caller's own hourly booking in a
  -- replaceable state: still open (requested), declined, or cancelled by the
  -- provider. This is the same authorization boundary the finalize withdraw
  -- relies on.
  if p_original_booking_id is not null then
    if not exists (
      select 1 from public.bookings b
      where b.id = p_original_booking_id
        and b.customer_id = v_actor
        and b.booking_flow = 'hourly_v1'
        and (
          b.status in ('requested', 'declined')
          or (b.status = 'cancelled' and b.cancelled_by_role = 'provider')
        )
    ) then
      raise exception 'REPLACEMENT_NOT_AVAILABLE_YET';
    end if;
  end if;

  insert into public.booking_drafts (
    booking_id, customer_id, provider_service_id, scheduled_at, estimated_minutes,
    details, address, job_zip, address_kind, service_city, latitude, longitude,
    on_decline_preference, hourly_rate_cents, stripe_payment_intent_id,
    stripe_customer_id, original_booking_id, expires_at
  ) values (
    p_booking_id, v_actor, p_provider_service_id, p_scheduled_at, p_estimated_minutes,
    coalesce(p_details, ''), p_address, p_job_zip, coalesce(p_address_kind, 'home'),
    coalesce(p_service_city, ''), p_latitude, p_longitude,
    coalesce(p_on_decline_preference, 'keep_control'), p_hourly_rate_cents,
    p_stripe_payment_intent_id, p_stripe_customer_id, p_original_booking_id,
    statement_timestamp() + interval '1 hour'
  );
end;
$function$;
