-- Test-time mode permits same-day manual quote flows, but a deposit deadline
-- must still precede the exact start. The old test-mode branch always used
-- now + 24 hours, which can be after a next-day start and violates
-- bookings_initial_payment_before_start.
create or replace function public.send_booking_quote(
  p_booking_id uuid,
  p_quote_cents integer,
  p_scheduled_at timestamptz,
  p_estimated_minutes integer
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := statement_timestamp();
  v_actor uuid := (select auth.uid());
  v_booking public.bookings%rowtype;
  v_local timestamp;
  v_end_local timestamp;
  v_existing_estimate integer;
  v_due timestamptz;
  v_deposit integer;
begin
  if p_quote_cents is null or p_quote_cents not between 2000 and 1000000 then
    raise exception 'INVALID_FINAL_QUOTE';
  end if;
  select b.* into v_booking from public.bookings b
  where b.id = p_booking_id and b.booking_flow = 'quote_v2'
    and public.owns_provider_profile(b.provider_id)
  for update;
  if not found then raise exception 'BOOKING_NOT_FOUND'; end if;
  if v_booking.status <> 'requested' then raise exception 'REQUEST_NO_LONGER_OPEN'; end if;
  if v_booking.response_alert_at is null or v_booking.response_alert_at <= v_now then
    raise exception 'REQUEST_EXPIRED';
  end if;
  if p_estimated_minutes not between 60 and 720
    or p_estimated_minutes % 15 <> 0 then raise exception 'INVALID_DURATION'; end if;
  select e.estimated_minutes into v_existing_estimate
  from public.booking_quote_provider_estimates e where e.booking_id = p_booking_id;
  if v_existing_estimate is not null and v_existing_estimate <> p_estimated_minutes then
    raise exception 'QUOTE_DURATION_CHANGED';
  end if;
  if p_scheduled_at <= v_now then raise exception 'REQUEST_EXPIRED'; end if;
  v_local := p_scheduled_at at time zone 'America/Chicago';
  v_end_local := v_local + make_interval(mins => p_estimated_minutes);
  if v_local::date <> v_booking.requested_local_date
    or v_end_local::date <> v_booking.requested_local_date then
    raise exception 'EXACT_START_OUTSIDE_REQUEST';
  end if;
  if not (
    (v_booking.requested_daypart = 'morning' and v_local::time >= time '08:00' and v_local::time < time '12:00')
    or (v_booking.requested_daypart = 'afternoon' and v_local::time >= time '12:00' and v_local::time <= time '17:00')
    or (v_booking.requested_daypart = 'either' and v_local::time >= time '08:00' and v_local::time <= time '17:00')
  ) then raise exception 'EXACT_START_OUTSIDE_REQUEST'; end if;
  if not exists (
    select 1 from private.provider_effective_window(
      v_booking.provider_id, v_booking.requested_local_date
    ) ew where v_local::time >= ew.start_local and v_end_local::time <= ew.end_local
  ) then raise exception 'OUTSIDE_PROVIDER_AVAILABILITY'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_booking.provider_id::text, 0));
  if private.provider_has_reserved_slot_conflict(
    v_booking.provider_id, p_scheduled_at, p_estimated_minutes, p_booking_id
  ) then raise exception 'PROVIDER_SLOT_ALREADY_RESERVED'; end if;
  if not private.has_current_legal_document(v_actor, 'platform_terms')
    or not private.has_current_legal_document(v_actor, 'provider_terms') then
    raise exception 'LEGAL_ACCEPTANCE_REQUIRED';
  end if;
  if not exists (
    select 1 from public.provider_services ps
    where ps.provider_id = v_booking.provider_id
      and ps.service_id = v_booking.service_id
      and public.is_provider_offering_quote_bookable(ps.id)
  ) then raise exception 'PROVIDER_NO_LONGER_READY'; end if;

  insert into public.booking_quote_provider_estimates (
    booking_id, estimated_minutes, updated_at
  ) values (p_booking_id, p_estimated_minutes, v_now)
  on conflict (booking_id) do update set
    estimated_minutes = excluded.estimated_minutes,
    updated_at = excluded.updated_at;
  v_deposit := ((p_quote_cents::bigint * 2000 + 5000) / 10000)::integer;
  v_due := case when private.booking_time_restrictions_disabled()
    then least(v_now + interval '24 hours', p_scheduled_at - interval '1 minute')
    else least(v_now + interval '24 hours', p_scheduled_at - interval '6 hours')
  end;
  if v_due <= v_now then raise exception 'QUOTE_PAYMENT_WINDOW_UNAVAILABLE'; end if;
  perform set_config('college_crew.trusted_booking_operation', 'on', true);
  update public.bookings set
    scheduled_at = p_scheduled_at, estimated_minutes = null,
    price_cents = p_quote_cents,
    platform_fee_cents = ((p_quote_cents::bigint * 500 + 5000) / 10000)::integer,
    upfront_payment_cents = v_deposit, quote_sent_at = v_now, accepted_at = v_now,
    initial_payment_due_at = v_due, status = 'accepted'
  where id = p_booking_id and status = 'requested';
  perform private.enqueue_booking_automation_job(
    'quote_payment_expiration_' || p_booking_id::text,
    'quote_payment_expiration', p_booking_id, p_booking_id, v_due
  );
  return p_booking_id;
end;
$$;
