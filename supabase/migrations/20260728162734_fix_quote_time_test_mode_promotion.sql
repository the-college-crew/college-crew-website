-- Correct the temporary quote timing override so quote_v1 is promoted to its
-- complete quote_v2 shape in one trigger-approved update. The ordinary path
-- remains unchanged when booking.test-time-restrictions-disabled is false.

begin;

set local lock_timeout = '10s';
set local statement_timeout = '2min';

create or replace function public.create_quote_deposit_booking_request(
  p_provider_service_id uuid,
  p_requested_local_date date,
  p_requested_daypart public.quote_daypart,
  p_address text,
  p_job_zip text,
  p_job_photos jsonb,
  p_details text default '',
  p_address_kind text default 'home',
  p_service_city text default '',
  p_latitude double precision default null,
  p_longitude double precision default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := statement_timestamp();
  v_provider_id uuid;
  v_minimum_notice_hours integer;
  v_requested_slot timestamptz;
  v_constructor_slot timestamptz;
  v_constructor_not_before timestamptz;
  v_id uuid;
  v_test_mode boolean := private.booking_time_restrictions_disabled();
begin
  select ps.provider_id, greatest(coalesce(pp.minimum_notice_hours, 12), 12)
  into v_provider_id, v_minimum_notice_hours
  from public.provider_services ps
  join public.provider_profiles pp on pp.id = ps.provider_id
  where ps.id = p_provider_service_id;
  if v_provider_id is null then raise exception 'OFFERING_NOT_BOOKABLE'; end if;

  -- This is the real date/daypart requested by the customer. In normal mode,
  -- the existing 12-hour quote notice remains in force.
  v_requested_slot := private.first_quote_daypart_slot(
    v_provider_id,
    p_requested_local_date,
    p_requested_daypart,
    60,
    case when v_test_mode then v_now else v_now + interval '12 hours' end,
    null
  );
  if v_requested_slot is null then raise exception 'QUOTE_DAYPART_UNAVAILABLE'; end if;

  v_constructor_slot := v_requested_slot;
  v_constructor_not_before :=
    v_now + make_interval(hours => v_minimum_notice_hours);

  -- The hardened quote_v1 constructor intentionally retains its normal timing
  -- checks. For a same-day manual test, validate through a separate future
  -- recurring slot, then discard that provisional slot during the single
  -- atomic promotion below. The customer's requested window was independently
  -- validated above and is the only schedule persisted on quote_v2.
  if v_test_mode and v_constructor_slot < v_constructor_not_before then
    select candidate.start_at
    into v_constructor_slot
    from generate_series(
      (v_now at time zone 'America/Chicago')::date,
      (v_now at time zone 'America/Chicago')::date + 90,
      interval '1 day'
    ) as day(local_date)
    cross join lateral (
      select private.first_quote_daypart_slot(
        v_provider_id,
        day.local_date::date,
        'either',
        60,
        v_constructor_not_before,
        null
      ) as start_at
    ) candidate
    where candidate.start_at is not null
      and exists (
        select 1
        from public.provider_availability_windows w
        where w.provider_id = v_provider_id
          and w.weekday = extract(
            isodow from candidate.start_at at time zone 'America/Chicago'
          )::integer - 1
          and (candidate.start_at at time zone 'America/Chicago')::time
            >= w.start_local
          and (
            (candidate.start_at + interval '60 minutes')
            at time zone 'America/Chicago'
          )::time <= w.end_local
      )
    order by candidate.start_at
    limit 1;
    if v_constructor_slot is null then
      raise exception 'QUOTE_DAYPART_UNAVAILABLE';
    end if;
  end if;

  -- Reuse the hardened quote-v1 identity, legal, photo, address, offering, and
  -- recurring-availability validation without first creating an incomplete
  -- quote_v2 row.
  v_id := public.create_quote_booking_request(
    p_provider_service_id,
    v_constructor_slot,
    60,
    1,
    p_address,
    p_job_zip,
    p_job_photos,
    p_details,
    p_address_kind,
    p_service_city,
    p_latitude,
    p_longitude
  );

  perform set_config('college_crew.quote_v2_promotion', 'on', true);
  perform set_config('college_crew.trusted_booking_operation', 'on', true);
  update public.bookings
  set
    booking_flow = 'quote_v2',
    requested_local_date = p_requested_local_date,
    requested_daypart = p_requested_daypart,
    scheduled_at = null,
    estimated_minutes = null,
    quote_negotiation_round = 0,
    response_window_hours = 2,
    response_alert_at = v_now + interval '2 hours',
    deposit_bps = 2000,
    cancellation_notice_hours = 12,
    fee_policy_version = 'quote-v2-500bps',
    cancellation_policy_version = 'quote-v2-12h',
    terms_version = '2026-07-27',
    customer_authorization_version = 'quote-v2-20pct-deposit',
    policy_snapshot = policy_snapshot || jsonb_build_object(
      'deposit_bps', 2000,
      'response_window_hours', 2,
      'minimum_notice_hours', 12,
      'quote_payment_rule', 'earlier_of_24h_or_6h_before_start',
      'requested_local_date', p_requested_local_date,
      'requested_daypart', p_requested_daypart,
      'daypart_timezone', 'America/Chicago'
    ),
    customer_authorization_snapshot = jsonb_build_object(
      'version', 'quote-v2-20pct-deposit',
      'scope', 'booking_only',
      'deposit_bps', 2000,
      'remaining_balance_after_job', true,
      'saved_method_authorization_required_at_deposit', true
    )
  where id = v_id and booking_flow = 'quote_v1';

  if not found then
    raise exception 'QUOTE_REQUEST_PROMOTION_FAILED';
  end if;

  perform private.enqueue_booking_automation_job(
    'quote_response_expiration_' || v_id::text,
    'quote_response_expiration',
    v_id,
    v_id,
    v_now + interval '2 hours'
  );
  perform private.enqueue_participant_email(
    'quote_request_new_' || v_id::text,
    v_id,
    'provider',
    'new_provider_request',
    jsonb_build_object('booking_id', v_id)
  );
  return v_id;
end;
$$;

revoke all on function public.create_quote_deposit_booking_request(
  uuid, date, public.quote_daypart, text, text, jsonb, text, text, text,
  double precision, double precision
) from public, anon;
grant execute on function public.create_quote_deposit_booking_request(
  uuid, date, public.quote_daypart, text, text, jsonb, text, text, text,
  double precision, double precision
) to authenticated;
revoke all on function public.create_quote_deposit_booking_request(
  uuid, timestamptz, integer, text, text, jsonb, text, text, text,
  double precision, double precision
) from public, anon, authenticated;

commit;
