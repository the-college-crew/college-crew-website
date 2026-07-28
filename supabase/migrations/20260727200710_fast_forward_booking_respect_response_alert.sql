set lock_timeout = '10s';
set statement_timeout = '2min';

create or replace function public.fast_forward_booking_for_testing(p_booking_id uuid)
returns timestamptz language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_now timestamptz := statement_timestamp();
  v_booking public.bookings%rowtype;
  v_target timestamptz;
begin
  if v_actor is null then raise exception 'AUTH_REQUIRED'; end if;
  if not public.is_admin() then raise exception 'NOT_AUTHORIZED'; end if;
  select b.* into v_booking from public.bookings b where b.id = p_booking_id for update of b;
  if not found then raise exception 'BOOKING_NOT_FOUND'; end if;
  v_target := v_now;
  if v_booking.response_alert_at is not null and v_booking.response_alert_at >= v_target then
    v_target := v_booking.response_alert_at + interval '1 second';
  end if;
  update public.bookings set scheduled_at = v_target where id = p_booking_id;
  insert into public.booking_audit_events (booking_id, actor_user_id, actor_kind, action, from_status, to_status, metadata)
  values (p_booking_id, v_actor, 'admin', 'testing_fast_forward', v_booking.status, v_booking.status,
    jsonb_build_object('old_scheduled_at', v_booking.scheduled_at, 'new_scheduled_at', v_target));
  return v_target;
end;
$$;
