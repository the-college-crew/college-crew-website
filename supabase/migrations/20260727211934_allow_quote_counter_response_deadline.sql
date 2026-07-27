-- response_alert_at is a lifecycle deadline, not an immutable request
-- snapshot. Quote counter selection legitimately replaces it with a fresh
-- two-hour provider response window. Keep direct/browser rewrites blocked,
-- while allowing the trusted booking RPCs that own lifecycle transitions.
begin;

set lock_timeout = '10s';
set statement_timeout = '2min';

alter table public.bookings
  drop constraint if exists bookings_response_deadline_valid;

alter table public.bookings
  add constraint bookings_response_deadline_valid check (
    (response_window_hours is null and response_alert_at is null)
    or (
      response_window_hours is not null
      and response_alert_at is not null
      and (
        (
          booking_flow = 'quote_v2'
          and response_window_hours = 2
          and response_alert_at >= created_at + interval '2 hours'
        )
        or (
          booking_flow <> 'quote_v2'
          and response_alert_at =
            created_at + response_window_hours * interval '1 hour'
        )
      )
    )
  );

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
  v_trusted_operation boolean :=
    coalesce(
      current_setting('college_crew.trusted_booking_operation', true),
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

  if new.response_alert_at is distinct from old.response_alert_at
    and not v_trusted_operation then
    raise exception 'booking response deadline requires a trusted operation';
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

commit;
