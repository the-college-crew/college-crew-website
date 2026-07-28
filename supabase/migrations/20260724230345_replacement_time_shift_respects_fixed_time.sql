-- Tier-2 replacement suggestions must respect "this time only".
create or replace function public.hourly_replacement_time_shift_ids(p_booking_id uuid)
 returns table(provider_service_id uuid, provider_id uuid, suggested_start_at timestamptz)
 language plpgsql security definer set search_path to ''
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
  select b.* into v_booking from public.bookings b
  where b.id = p_booking_id and b.booking_flow = 'hourly_v1' and b.customer_id = v_actor;
  if not found then raise exception 'BOOKING_NOT_FOUND'; end if;
  if v_booking.status not in ('requested', 'declined', 'cancelled') or v_booking.scheduled_at <= v_now then return; end if;
  if v_booking.status = 'cancelled' and v_booking.cancelled_by_role is distinct from 'provider' then return; end if;
  if v_booking.status = 'requested' and v_now < v_booking.response_alert_at then raise exception 'REPLACEMENT_NOT_AVAILABLE_YET'; end if;
  if v_booking.estimated_minutes is null or v_booking.time_flexibility = 'fixed' then return; end if;
  v_requested_date := (v_booking.scheduled_at at time zone 'America/Chicago')::date;
  return query
  with eligible as (
    select ps.id as provider_service_id, pp.id as provider_id, pp.minimum_notice_hours,
      ps.hourly_rate_cents, coalesce(pr.avg_rating, 0) as avg_rating, lower(pp.display_name) as sort_name
    from public.provider_services ps
    join public.provider_profiles pp on pp.id = ps.provider_id
    join public.services s on s.id = ps.service_id
    left join public.provider_ratings pr on pr.provider_id = pp.id
    where ps.service_id = v_booking.service_id and pp.id <> v_booking.provider_id
      and pp.verification_status = 'approved' and pp.stripe_account_id is not null
      and pp.stripe_transfers_active and pp.stripe_transfers_checked_at is not null
      and pp.service_zip is not null and ps.hourly_rate_cents between 2000 and 15000 and s.is_live
  )
  select best.provider_service_id, best.provider_id, best.start_at
  from eligible e
  cross join lateral (
    select e.provider_service_id, e.provider_id, ranked.start_at
    from (
      select slot.start_at
      from (
        select generate_series((v_requested_date - c_days_before)::timestamp,
          (v_requested_date + c_days_after)::timestamp, interval '1 day')::date as local_date
      ) as day
      join public.provider_availability_windows w on w.provider_id = e.provider_id
        and w.weekday = extract(isodow from day.local_date)::integer - 1
      cross join lateral generate_series(0, greatest(0, ((extract(epoch from (w.end_local - w.start_local))::integer / 60) - v_booking.estimated_minutes) / c_step_minutes)) as step(n)
      cross join lateral (
        select ((day.local_date + w.start_local) + make_interval(mins => step.n * c_step_minutes)) at time zone 'America/Chicago' as start_at
      ) slot
      where w.start_local + make_interval(mins => v_booking.estimated_minutes) <= w.end_local
        and slot.start_at <> v_booking.scheduled_at
        and slot.start_at >= v_now + make_interval(hours => e.minimum_notice_hours)
      order by abs(extract(epoch from (slot.start_at - v_booking.scheduled_at)))
      offset 0
    ) ranked
    where not private.provider_has_reserved_slot_conflict(e.provider_id, ranked.start_at, v_booking.estimated_minutes, null)
    limit 1
  ) best
  where not exists (select 1 from public.hourly_replacement_candidate_ids(p_booking_id) t1 where t1.provider_service_id = best.provider_service_id)
  order by abs(extract(epoch from (best.start_at - v_booking.scheduled_at))), e.avg_rating desc, e.hourly_rate_cents, e.sort_name, e.provider_id
  limit c_max_rows;
end;
$function$;

comment on function public.hourly_replacement_time_shift_ids(uuid) is
  'Tier-2 replacement suggestions: eligible providers who cannot make the original slot, each with their nearest workable start time. Returns nothing when the customer chose time_flexibility = fixed. Ordered by closeness to the requested time; the app layer picks a diversified shortlist.';
