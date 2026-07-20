-- Lightweight provider en-route ping. This is deliberately not a booking
-- status: it records one immutable notification timestamp while the job stays
-- booked, then the existing Arrived action begins work.

set lock_timeout = '10s';
set statement_timeout = '2min';

alter table public.bookings
  add column en_route_at timestamptz;

create function private.enforce_booking_en_route_immutability()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.en_route_at is not null
    and new.en_route_at is distinct from old.en_route_at then
    raise exception 'booking en-route timestamp cannot be rewritten';
  end if;
  return new;
end;
$$;

revoke execute on function private.enforce_booking_en_route_immutability()
  from public, anon, authenticated, service_role;

create trigger booking_en_route_immutable
  before update of en_route_at on public.bookings
  for each row execute function private.enforce_booking_en_route_immutability();

create function public.mark_booking_en_route(p_booking_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_now timestamptz := statement_timestamp();
  v_booking public.bookings%rowtype;
begin
  if v_actor is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  select b.* into v_booking
  from public.bookings b
  where b.id = p_booking_id
  for update of b;
  if not found then
    raise exception 'BOOKING_NOT_FOUND';
  end if;
  if not public.owns_provider_profile(v_booking.provider_id) then
    raise exception 'NOT_AUTHORIZED';
  end if;
  if v_booking.booking_flow <> 'hourly_v1' then
    raise exception 'NOT_HOURLY_BOOKING';
  end if;
  if v_booking.status <> 'booked' then
    raise exception 'BOOKING_NOT_BOOKED:%', v_booking.status;
  end if;
  if v_booking.arrived_at is not null then
    raise exception 'BOOKING_ALREADY_ARRIVED';
  end if;
  if v_booking.en_route_at is not null then
    return v_booking.en_route_at;
  end if;
  if v_now < v_booking.scheduled_at - interval '2 hours' then
    raise exception 'EN_ROUTE_TOO_EARLY';
  end if;

  update public.bookings
  set en_route_at = v_now
  where id = p_booking_id and status = 'booked' and en_route_at is null;

  insert into public.booking_audit_events (
    booking_id, actor_user_id, actor_kind, action, from_status, to_status, metadata
  )
  values (
    p_booking_id, v_actor, 'provider', 'provider_en_route', 'booked', 'booked',
    jsonb_build_object('en_route_at', v_now, 'scheduled_at', v_booking.scheduled_at)
  );

  return v_now;
end;
$$;

revoke execute on function public.mark_booking_en_route(uuid)
  from public, anon, service_role;
grant execute on function public.mark_booking_en_route(uuid) to authenticated;

create function private.queue_booking_en_route_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.booking_flow = 'hourly_v1'
    and new.en_route_at is not null
    and old.en_route_at is null then
    perform private.enqueue_participant_email(
      'en_route_customer_' || new.id::text,
      new.id,
      'customer',
      'provider_en_route',
      jsonb_build_object('booking_id', new.id, 'en_route_at', new.en_route_at)
    );
  end if;
  return new;
end;
$$;

revoke execute on function private.queue_booking_en_route_email()
  from public, anon, authenticated, service_role;

create trigger booking_en_route_email
  after update of en_route_at on public.bookings
  for each row execute function private.queue_booking_en_route_email();
