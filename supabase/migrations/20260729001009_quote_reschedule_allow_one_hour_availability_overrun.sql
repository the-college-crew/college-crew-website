-- Quote chat reschedules keep the agreed duration, and may end up to one hour
-- after a single listed work period. They still cannot overlap another booking.
create or replace function private.assert_quote_chat_reschedule_slot(
  p_provider_id uuid, p_service_id uuid, p_scheduled_at timestamptz,
  p_estimated_minutes integer, p_now timestamptz, p_exclude_booking_id uuid
) returns void language plpgsql security definer set search_path = '' as $$
declare v_local_start timestamp; v_local_end timestamp;
begin
  if p_estimated_minutes not between 60 and 720 or p_estimated_minutes % 15 <> 0 then raise exception 'INVALID_DURATION'; end if;
  if not exists (
    select 1 from public.provider_services ps
    where ps.provider_id = p_provider_id and ps.service_id = p_service_id
      and public.is_provider_offering_quote_bookable(ps.id)
  ) then raise exception 'PROVIDER_NO_LONGER_READY'; end if;
  if not private.booking_time_restrictions_disabled()
    and p_scheduled_at < p_now + interval '12 hours' then raise exception 'MINIMUM_NOTICE_NOT_MET'; end if;
  v_local_start := p_scheduled_at at time zone 'America/Chicago';
  v_local_end := v_local_start + make_interval(mins => p_estimated_minutes);
  if v_local_start::date <> v_local_end::date or not exists (
    select 1 from private.provider_effective_window(p_provider_id, v_local_start::date) ew
    where v_local_start::time >= ew.start_local
      and v_local_end <= v_local_start::date + ew.end_local + interval '1 hour'
  ) then raise exception 'OUTSIDE_PROVIDER_AVAILABILITY'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_provider_id::text, 0));
  if private.provider_has_reserved_slot_conflict(p_provider_id, p_scheduled_at, p_estimated_minutes, p_exclude_booking_id) then
    raise exception 'PROVIDER_SLOT_ALREADY_RESERVED';
  end if;
end;
$$;

revoke all on function private.assert_quote_chat_reschedule_slot(uuid, uuid, timestamptz, integer, timestamptz, uuid) from public, anon, authenticated, service_role;
