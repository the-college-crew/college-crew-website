-- Manual pilot-testing helper: admin-only bypass for the arrival timing gate.
set lock_timeout = '10s';
set statement_timeout = '2min';

create function public.mark_booking_arrived_for_testing(p_booking_id uuid)
returns text language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_now timestamptz := statement_timestamp();
  v_booking public.bookings%rowtype;
begin
  if v_actor is null then raise exception 'AUTH_REQUIRED'; end if;
  if not public.is_admin() then raise exception 'NOT_AUTHORIZED'; end if;
  select b.* into v_booking from public.bookings b where b.id = p_booking_id for update of b;
  if not found then raise exception 'BOOKING_NOT_FOUND'; end if;
  if v_booking.booking_flow <> 'hourly_v1' then raise exception 'NOT_HOURLY_BOOKING'; end if;
  if v_booking.status = 'in_progress' then return 'in_progress'; end if;
  if v_booking.status <> 'booked' then raise exception 'BOOKING_NOT_BOOKED:%', v_booking.status; end if;
  perform set_config('college_crew.trusted_booking_operation', 'on', true);
  update public.bookings set status = 'in_progress', arrived_at = v_now where id = p_booking_id and status = 'booked';
  insert into public.booking_audit_events (booking_id, actor_user_id, actor_kind, action, from_status, to_status, metadata)
  values (p_booking_id, v_actor, 'admin', 'testing_mark_arrived', 'booked', 'in_progress',
    jsonb_build_object('arrived_at', v_now, 'scheduled_at', v_booking.scheduled_at));
  perform private.enqueue_booking_automation_job('completion_timeout_' || p_booking_id::text,
    'completion_timeout', p_booking_id, p_booking_id, v_now + interval '24 hours');
  return 'in_progress';
end;
$$;

revoke execute on function public.mark_booking_arrived_for_testing(uuid) from public, anon, service_role;
grant execute on function public.mark_booking_arrived_for_testing(uuid) to authenticated;
