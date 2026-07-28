-- A provider's Morning or Afternoon counter is a fixed window. An Either
-- counter offers the date while letting the customer choose the daypart that
-- works for them before the quote request returns to the provider.

begin;

set local lock_timeout = '10s';
set local statement_timeout = '2min';

create or replace function public.select_quote_counter_option(
  p_booking_id uuid,
  p_option_id uuid,
  p_requested_daypart public.quote_daypart
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

  if v_option.daypart <> 'either'
    and p_requested_daypart <> v_option.daypart then
    raise exception 'COUNTER_DAYPART_NOT_ALLOWED';
  end if;

  select e.estimated_minutes into v_estimate
  from public.booking_quote_provider_estimates e where e.booking_id = p_booking_id;
  if v_estimate is null then raise exception 'INVALID_DURATION'; end if;
  if private.first_quote_daypart_slot(
    v_booking.provider_id,
    v_option.local_date,
    p_requested_daypart,
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
      requested_daypart = p_requested_daypart,
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

-- The old two-argument API cannot express a required customer choice for an
-- Either counter, so browser callers must use the new explicit daypart RPC.
revoke all on function public.select_quote_counter_option(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.select_quote_counter_option(
  uuid, uuid, public.quote_daypart
) from public, anon;
grant execute on function public.select_quote_counter_option(
  uuid, uuid, public.quote_daypart
) to authenticated;

commit;
