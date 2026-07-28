-- Quote-v2 uses a fixed two-hour response window, but its hardened quote-v1
-- constructor intentionally accepts only the legacy customer-selectable
-- presets (1, 3, 5, 12, 24, 48, 72). The original quote-v2 wrapper passed 2
-- into that constructor and every valid quote request failed with
-- INVALID_RESPONSE_WINDOW.
--
-- Use an allowed one-hour value only for the provisional quote-v1 row. This
-- function promotes that row to quote-v2 and replaces the provisional deadline
-- with the required two-hour deadline in the same transaction, before the row
-- can commit or any notification is enqueued.
--
-- The original quote-v2 migration also tried to rewrite immutable snapshots
-- across two updates, but the quote-v2 table constraint requires the complete
-- date/daypart shape immediately. Permit only that one atomic initialization.
create or replace function private.enforce_booking_immutability()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_quote_promotion_enabled boolean :=
    coalesce(
      current_setting('college_crew.quote_v2_promotion', true),
      ''
    ) = 'on';
  v_quote_request_initialization boolean := false;
begin
  v_quote_request_initialization :=
    v_quote_promotion_enabled
    and old.booking_flow = 'quote_v1'
    and new.booking_flow = 'quote_v2'
    and old.scheduled_at is not null
    and new.scheduled_at is null
    and old.estimated_minutes = 60
    and new.estimated_minutes is null
    and old.requested_local_date is null
    and new.requested_local_date is not null
    and old.requested_daypart is null
    and new.requested_daypart is not null
    and new.quote_negotiation_round = 0
    and (
      new.customer_id,
      new.provider_id,
      new.service_id,
      new.job_zip,
      new.hourly_rate_cents_snapshot,
      new.platform_fee_bps,
      new.billing_minimum_minutes,
      new.billing_increment_minutes,
      new.pilot_timezone,
      new.customer_name_snapshot,
      new.provider_display_name_snapshot,
      new.service_name_snapshot,
      new.replacement_for_booking_id
    ) is not distinct from (
      old.customer_id,
      old.provider_id,
      old.service_id,
      old.job_zip,
      old.hourly_rate_cents_snapshot,
      old.platform_fee_bps,
      old.billing_minimum_minutes,
      old.billing_increment_minutes,
      old.pilot_timezone,
      old.customer_name_snapshot,
      old.provider_display_name_snapshot,
      old.service_name_snapshot,
      old.replacement_for_booking_id
    )
    and new.deposit_bps = 2000
    and new.cancellation_notice_hours = 12
    and new.response_window_hours = 2
    and new.response_alert_at = old.created_at + interval '2 hours'
    and new.fee_policy_version = 'quote-v2-500bps'
    and new.cancellation_policy_version = 'quote-v2-12h'
    and new.terms_version = '2026-07-27'
    and new.customer_authorization_version = 'quote-v2-20pct-deposit'
    and new.customer_authorization_snapshot = jsonb_build_object(
      'version', 'quote-v2-20pct-deposit',
      'scope', 'booking_only',
      'deposit_bps', 2000,
      'remaining_balance_after_job', true,
      'saved_method_authorization_required_at_deposit', true
    )
    and new.policy_snapshot = old.policy_snapshot || jsonb_build_object(
      'deposit_bps', 2000,
      'response_window_hours', 2,
      'minimum_notice_hours', 12,
      'quote_payment_rule', 'earlier_of_24h_or_6h_before_start',
      'requested_local_date', new.requested_local_date,
      'requested_daypart', new.requested_daypart,
      'daypart_timezone', 'America/Chicago'
    );

  if (
    new.booking_flow,
    new.customer_id,
    new.provider_id,
    new.service_id,
    new.estimated_minutes,
    new.job_zip,
    new.hourly_rate_cents_snapshot,
    new.platform_fee_bps,
    new.billing_minimum_minutes,
    new.billing_increment_minutes,
    new.cancellation_notice_hours,
    new.pilot_timezone,
    new.response_window_hours,
    new.response_alert_at,
    new.customer_name_snapshot,
    new.provider_display_name_snapshot,
    new.service_name_snapshot,
    new.fee_policy_version,
    new.cancellation_policy_version,
    new.terms_version,
    new.customer_authorization_version,
    new.policy_snapshot,
    new.customer_authorization_snapshot,
    new.replacement_for_booking_id
  ) is distinct from (
    old.booking_flow,
    old.customer_id,
    old.provider_id,
    old.service_id,
    old.estimated_minutes,
    old.job_zip,
    old.hourly_rate_cents_snapshot,
    old.platform_fee_bps,
    old.billing_minimum_minutes,
    old.billing_increment_minutes,
    old.cancellation_notice_hours,
    old.pilot_timezone,
    old.response_window_hours,
    old.response_alert_at,
    old.customer_name_snapshot,
    old.provider_display_name_snapshot,
    old.service_name_snapshot,
    old.fee_policy_version,
    old.cancellation_policy_version,
    old.terms_version,
    old.customer_authorization_version,
    old.policy_snapshot,
    old.customer_authorization_snapshot,
    old.replacement_for_booking_id
  )
    and not v_quote_request_initialization then
    raise exception 'booking identity, pricing, and policy snapshots are immutable';
  end if;

  if (old.accepted_at is not null and new.accepted_at is distinct from old.accepted_at)
    or (
      old.initial_payment_due_at is not null
      and new.initial_payment_due_at is distinct from old.initial_payment_due_at
    )
    or (old.arrived_at is not null and new.arrived_at is distinct from old.arrived_at)
    or (
      old.work_completed_at is not null
      and new.work_completed_at is distinct from old.work_completed_at
    )
    or (old.cancelled_at is not null and new.cancelled_at is distinct from old.cancelled_at)
    or (old.withdrawn_at is not null and new.withdrawn_at is distinct from old.withdrawn_at)
    or (old.expired_at is not null and new.expired_at is distinct from old.expired_at)
    or (
      old.replaced_by_booking_id is not null
      and new.replaced_by_booking_id is distinct from old.replaced_by_booking_id
    ) then
    raise exception 'booking lifecycle timestamps and links cannot be rewritten';
  end if;

  return new;
end;
$$;

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
  v_slot timestamptz;
  v_id uuid;
begin
  select ps.provider_id into v_provider_id
  from public.provider_services ps
  where ps.id = p_provider_service_id;
  if v_provider_id is null then raise exception 'OFFERING_NOT_BOOKABLE'; end if;

  v_slot := private.first_quote_daypart_slot(
    v_provider_id, p_requested_local_date, p_requested_daypart,
    60, v_now + interval '12 hours', null
  );
  if v_slot is null then raise exception 'QUOTE_DAYPART_UNAVAILABLE'; end if;

  -- Reuse the hardened quote-v1 checks with an allowed provisional response
  -- value. The row is promoted to its complete quote-v2 shape below before
  -- this transaction can commit.
  v_id := public.create_quote_booking_request(
    p_provider_service_id, v_slot, 60, 1,
    p_address, p_job_zip, p_job_photos, p_details, p_address_kind,
    p_service_city, p_latitude, p_longitude
  );

  -- Both flags are transaction-local. The dedicated flag is accepted only for
  -- the exact complete initialization shape above.
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

  perform private.enqueue_booking_automation_job(
    'quote_response_expiration_' || v_id::text,
    'quote_response_expiration', v_id, v_id, v_now + interval '2 hours'
  );
  perform private.enqueue_participant_email(
    'quote_request_new_' || v_id::text, v_id, 'provider',
    'new_provider_request', jsonb_build_object('booking_id', v_id)
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
