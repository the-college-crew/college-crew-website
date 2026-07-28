-- Extend the temporary founder-controlled timing override to quote counter
-- offers. Availability, ownership, response-state, and conflict validation
-- remain intact; only the normal 12-hour notice and customer decision deadline
-- are relaxed while booking.test-time-restrictions-disabled is true.

begin;

set local lock_timeout = '10s';
set local statement_timeout = '2min';

create or replace function public.counter_quote_booking_request(
  p_booking_id uuid,
  p_estimated_minutes integer,
  p_options jsonb,
  p_note text default ''
)
returns smallint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := statement_timestamp();
  v_booking public.bookings%rowtype;
  v_count integer;
  v_round smallint;
  v_option jsonb;
  v_date date;
  v_daypart public.quote_daypart;
  v_earliest timestamp;
  v_due timestamptz;
  v_ordinal integer := 0;
  v_test_mode boolean := private.booking_time_restrictions_disabled();
begin
  select b.* into v_booking
  from public.bookings b
  where b.id = p_booking_id and b.booking_flow = 'quote_v2'
    and public.owns_provider_profile(b.provider_id)
  for update;
  if not found then raise exception 'BOOKING_NOT_FOUND'; end if;
  if v_booking.status <> 'requested' then
    raise exception 'REQUEST_NO_LONGER_OPEN:%', v_booking.status;
  end if;
  if v_booking.response_alert_at is null or v_booking.response_alert_at <= v_now then
    raise exception 'REQUEST_EXPIRED';
  end if;
  if p_estimated_minutes not between 60 and 720
    or p_estimated_minutes % 15 <> 0 then raise exception 'INVALID_DURATION'; end if;
  if char_length(btrim(coalesce(p_note, ''))) > 500 then
    raise exception 'COUNTER_NOTE_TOO_LONG';
  end if;
  if p_options is null or jsonb_typeof(p_options) <> 'array' then
    raise exception 'INVALID_COUNTER_OPTIONS';
  end if;
  v_count := jsonb_array_length(p_options);
  if v_count not between 1 and 3 then raise exception 'INVALID_COUNTER_OPTIONS'; end if;

  create temporary table if not exists pg_temp.valid_quote_options (
    ordinal integer, local_date date, daypart public.quote_daypart
  ) on commit drop;
  truncate pg_temp.valid_quote_options;

  for v_option in select value from jsonb_array_elements(p_options)
  loop
    v_ordinal := v_ordinal + 1;
    begin
      v_date := (v_option->>'localDate')::date;
      v_daypart := (v_option->>'daypart')::public.quote_daypart;
    exception when others then
      raise exception 'INVALID_COUNTER_OPTIONS';
    end;
    if v_date = v_booking.requested_local_date then
      raise exception 'COUNTER_DATE_MUST_CHANGE';
    end if;
    if exists (
      select 1 from pg_temp.valid_quote_options o where o.local_date = v_date
    ) then raise exception 'DUPLICATE_COUNTER_DATE'; end if;
    if private.first_quote_daypart_slot(
      v_booking.provider_id,
      v_date,
      v_daypart,
      p_estimated_minutes,
      case when v_test_mode then v_now else v_now + interval '12 hours' end,
      p_booking_id
    ) is null then raise exception 'QUOTE_DAYPART_UNAVAILABLE'; end if;
    insert into pg_temp.valid_quote_options values (v_ordinal, v_date, v_daypart);
  end loop;

  select min(private.quote_daypart_start(local_date, daypart))
  into v_earliest from pg_temp.valid_quote_options;
  v_due := case when v_test_mode then v_now + interval '24 hours' else least(
    v_now + interval '24 hours',
    (v_earliest at time zone 'America/Chicago') - interval '12 hours'
  ) end;
  if v_due <= v_now then raise exception 'COUNTER_WINDOW_UNAVAILABLE'; end if;
  v_round := v_booking.quote_negotiation_round + 1;

  insert into public.booking_quote_provider_estimates (
    booking_id, estimated_minutes, updated_at
  ) values (p_booking_id, p_estimated_minutes, v_now)
  on conflict (booking_id) do update set
    estimated_minutes = excluded.estimated_minutes,
    updated_at = excluded.updated_at;

  insert into public.booking_quote_counter_options (
    booking_id, round_number, ordinal, local_date, daypart, offered_at, expires_at
  )
  select p_booking_id, v_round, ordinal, local_date, daypart, v_now, v_due
  from pg_temp.valid_quote_options order by ordinal;

  perform set_config('college_crew.trusted_booking_operation', 'on', true);
  update public.bookings
  set status = 'countered',
      quote_negotiation_round = v_round,
      counter_note = nullif(btrim(coalesce(p_note, '')), ''),
      countered_at = v_now
  where id = p_booking_id and status = 'requested';

  perform private.enqueue_booking_automation_job(
    'quote_counter_expiration_' || p_booking_id::text || '_' || v_round::text,
    'quote_response_expiration', p_booking_id, p_booking_id, v_due
  );
  perform private.enqueue_participant_email(
    'quote_counter_' || p_booking_id::text || '_' || v_round::text,
    p_booking_id, 'customer', 'quote_counter_options',
    jsonb_build_object('booking_id', p_booking_id, 'round', v_round)
  );
  return v_round;
end;
$$;

create or replace function public.select_quote_counter_option(
  p_booking_id uuid,
  p_option_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := statement_timestamp();
  v_booking public.bookings%rowtype;
  v_option public.booking_quote_counter_options%rowtype;
  v_estimate integer;
  v_test_mode boolean := private.booking_time_restrictions_disabled();
begin
  select b.* into v_booking from public.bookings b
  where b.id = p_booking_id and b.booking_flow = 'quote_v2'
    and b.customer_id = (select auth.uid())
  for update;
  if not found then raise exception 'BOOKING_NOT_FOUND'; end if;
  if v_booking.status <> 'countered' then raise exception 'REQUEST_NO_LONGER_OPEN'; end if;
  select o.* into v_option from public.booking_quote_counter_options o
  where o.id = p_option_id and o.booking_id = p_booking_id
    and o.round_number = v_booking.quote_negotiation_round
  for update;
  if not found then raise exception 'COUNTER_OPTION_NOT_FOUND'; end if;
  if v_option.expires_at <= v_now then raise exception 'REQUEST_EXPIRED'; end if;
  select e.estimated_minutes into v_estimate
  from public.booking_quote_provider_estimates e where e.booking_id = p_booking_id;
  if v_estimate is null then raise exception 'INVALID_DURATION'; end if;
  if private.first_quote_daypart_slot(
    v_booking.provider_id,
    v_option.local_date,
    v_option.daypart,
    v_estimate,
    case when v_test_mode then v_now else v_now + interval '12 hours' end,
    p_booking_id
  ) is null then raise exception 'QUOTE_DAYPART_UNAVAILABLE'; end if;

  update public.booking_quote_counter_options
  set selected_at = v_now where id = v_option.id and selected_at is null;
  perform set_config('college_crew.trusted_booking_operation', 'on', true);
  update public.bookings
  set status = 'requested',
      requested_local_date = v_option.local_date,
      requested_daypart = v_option.daypart,
      response_alert_at = v_now + interval '2 hours',
      counter_note = null
  where id = p_booking_id and status = 'countered';
  perform private.enqueue_booking_automation_job(
    'quote_response_expiration_' || p_booking_id::text || '_'
      || v_booking.quote_negotiation_round::text || '_selected',
    'quote_response_expiration', p_booking_id, p_booking_id,
    v_now + interval '2 hours'
  );
  perform private.enqueue_participant_email(
    'quote_option_selected_' || p_booking_id::text || '_'
      || v_booking.quote_negotiation_round::text,
    p_booking_id, 'provider', 'quote_option_selected',
    jsonb_build_object('booking_id', p_booking_id)
  );
  return p_booking_id;
end;
$$;

revoke all on function public.counter_quote_booking_request(uuid, integer, jsonb, text)
  from public, anon;
grant execute on function public.counter_quote_booking_request(uuid, integer, jsonb, text)
  to authenticated;
revoke all on function public.select_quote_counter_option(uuid, uuid)
  from public, anon;
grant execute on function public.select_quote_counter_option(uuid, uuid)
  to authenticated;

commit;
