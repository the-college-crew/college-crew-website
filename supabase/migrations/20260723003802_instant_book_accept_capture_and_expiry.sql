-- Instant-book: accept/decline/expire now key off the 2h response window, the
-- post-accept payment-deadline stage is retired, and settle books on accept.
-- Applied to the shared project via MCP apply_migration on 2026-07-22.

-- Accept: move requested -> accepted (capture happens in the app layer). No
-- payment deadline is set anymore; the 2h response window is response_alert_at.
create or replace function public.accept_booking_request(p_booking_id uuid)
 returns uuid
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_actor uuid := (select auth.uid());
  v_now timestamptz := statement_timestamp();
  v_booking public.bookings%rowtype;
begin
  select b.* into v_booking
  from public.bookings b
  join public.provider_profiles pp on pp.id = b.provider_id
  where b.id = p_booking_id and pp.user_id = v_actor
  for update of b;
  if not found then
    raise exception 'BOOKING_NOT_FOUND';
  end if;
  if v_booking.status <> 'requested' then
    raise exception 'REQUEST_NO_LONGER_OPEN:%', v_booking.status;
  end if;
  if v_booking.scheduled_at <= v_now then
    perform set_config('college_crew.trusted_booking_operation', 'on', true);
    update public.bookings
    set status = 'expired', expired_at = v_now
    where id = p_booking_id and status = 'requested';
    raise exception 'REQUEST_EXPIRED';
  end if;
  if v_booking.booking_flow = 'hourly_v1'
    and v_booking.response_alert_at is not null
    and v_booking.response_alert_at <= v_now then
    perform set_config('college_crew.trusted_booking_operation', 'on', true);
    update public.bookings
    set status = 'expired', expired_at = v_now
    where id = p_booking_id and status = 'requested';
    raise exception 'REQUEST_EXPIRED';
  end if;

  if v_booking.booking_flow = 'legacy' then
    update public.bookings set status = 'accepted'
    where id = p_booking_id and status = 'requested';
    return p_booking_id;
  end if;

  if not exists (
    select 1
    from public.provider_profiles pp
    join public.services s on s.id = v_booking.service_id
    where pp.id = v_booking.provider_id
      and pp.verification_status = 'approved'
      and pp.stripe_account_id is not null
      and pp.stripe_transfers_active
      and pp.stripe_transfers_checked_at is not null
      and s.is_live
  ) then
    raise exception 'PROVIDER_NO_LONGER_READY';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_booking.provider_id::text, 0));
  if private.provider_has_reserved_slot_conflict(
    v_booking.provider_id,
    v_booking.scheduled_at,
    v_booking.estimated_minutes,
    v_booking.id
  ) then
    raise exception 'PROVIDER_SLOT_ALREADY_RESERVED';
  end if;

  perform set_config('college_crew.trusted_booking_operation', 'on', true);
  update public.bookings
  set status = 'accepted', accepted_at = v_now
  where id = p_booking_id and status = 'requested';
  if not found then
    raise exception 'REQUEST_NO_LONGER_OPEN';
  end if;
  return p_booking_id;
end;
$function$;

-- Decline: also treat a lapsed 2h window as expired.
create or replace function public.decline_booking_request(p_booking_id uuid)
 returns uuid
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_actor uuid := (select auth.uid());
  v_now timestamptz := statement_timestamp();
  v_booking public.bookings%rowtype;
begin
  select b.* into v_booking
  from public.bookings b
  join public.provider_profiles pp on pp.id = b.provider_id
  where b.id = p_booking_id and pp.user_id = v_actor
  for update of b;
  if not found then
    raise exception 'BOOKING_NOT_FOUND';
  end if;
  if v_booking.status <> 'requested' then
    raise exception 'REQUEST_NO_LONGER_OPEN:%', v_booking.status;
  end if;
  if v_booking.booking_flow = 'hourly_v1'
    and (
      v_booking.scheduled_at <= v_now
      or (v_booking.response_alert_at is not null and v_booking.response_alert_at <= v_now)
    ) then
    perform set_config('college_crew.trusted_booking_operation', 'on', true);
    update public.bookings
    set status = 'expired', expired_at = v_now
    where id = p_booking_id and status = 'requested';
    raise exception 'REQUEST_EXPIRED';
  end if;

  perform set_config('college_crew.trusted_booking_operation', 'on', true);
  update public.bookings set status = 'declined'
  where id = p_booking_id and status = 'requested';
  if not found then
    raise exception 'REQUEST_NO_LONGER_OPEN';
  end if;
  return p_booking_id;
end;
$function$;

-- Expire: fire once the 2h response window (response_alert_at) has passed.
create or replace function public.expire_hourly_booking_request(p_booking_id uuid)
 returns uuid
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_actor uuid := (select auth.uid());
  v_now timestamptz := statement_timestamp();
  v_booking public.bookings%rowtype;
begin
  select b.* into v_booking
  from public.bookings b
  where b.id = p_booking_id and b.booking_flow = 'hourly_v1'
  for update;
  if not found then
    raise exception 'BOOKING_NOT_FOUND';
  end if;
  if v_actor is not null
    and v_booking.customer_id <> v_actor
    and not public.owns_provider_profile(v_booking.provider_id)
    and not public.is_admin() then
    raise exception 'BOOKING_NOT_FOUND';
  end if;
  if v_booking.status <> 'requested' then
    return p_booking_id;
  end if;
  if coalesce(v_booking.response_alert_at, v_booking.scheduled_at) > v_now then
    raise exception 'REQUEST_NOT_DUE_TO_EXPIRE';
  end if;
  perform set_config('college_crew.trusted_booking_operation', 'on', true);
  update public.bookings
  set status = 'expired', expired_at = v_now
  where id = p_booking_id and status = 'requested';
  return p_booking_id;
end;
$function$;

-- Settle: a first-hour success while 'accepted' books it (capture happens at
-- accept now, so there is no payment deadline to compare against).
create or replace function public.settle_first_hour_payment(p_stripe_payment_intent_id text, p_stripe_payment_method_id text DEFAULT NULL::text, p_succeeded_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 returns text
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_payment public.booking_payments%rowtype;
  v_booking public.bookings%rowtype;
  v_succeeded_at timestamptz := coalesce(p_succeeded_at, statement_timestamp());
begin
  select bp.* into v_payment
  from public.booking_payments bp
  where bp.stripe_payment_intent_id = p_stripe_payment_intent_id
    and bp.kind = 'first_hour';
  if not found then
    return 'not_found';
  end if;

  select b.* into v_booking
  from public.bookings b
  where b.id = v_payment.booking_id
  for update of b;

  if v_booking.status = 'booked' and v_payment.status = 'succeeded' then
    return 'already_booked';
  end if;

  if v_booking.status = 'accepted' then
    update public.booking_payments
    set
      status = 'succeeded',
      stripe_payment_method_id = coalesce(p_stripe_payment_method_id, stripe_payment_method_id),
      succeeded_at = v_succeeded_at,
      updated_at = now()
    where id = v_payment.id;

    perform set_config('college_crew.trusted_booking_operation', 'on', true);
    update public.bookings
    set status = 'booked', stripe_payment_intent_id = p_stripe_payment_intent_id
    where id = v_booking.id and status = 'accepted';

    insert into public.booking_audit_events (
      booking_id, actor_user_id, actor_kind, action, from_status, to_status, metadata
    )
    values (
      v_booking.id, null, 'stripe', 'first_hour_payment_succeeded', 'accepted', 'booked',
      jsonb_build_object(
        'payment_id', v_payment.id,
        'stripe_payment_intent_id', p_stripe_payment_intent_id,
        'succeeded_at', v_succeeded_at
      )
    );
    return 'booked';
  end if;

  if v_payment.status <> 'succeeded' then
    update public.booking_payments
    set
      status = 'succeeded',
      stripe_payment_method_id = coalesce(p_stripe_payment_method_id, stripe_payment_method_id),
      succeeded_at = v_succeeded_at,
      updated_at = now()
    where id = v_payment.id;

    insert into public.booking_audit_events (
      booking_id, actor_user_id, actor_kind, action, from_status, to_status, metadata
    )
    values (
      v_booking.id, null, 'stripe', 'first_hour_payment_succeeded_late', v_booking.status, null,
      jsonb_build_object(
        'payment_id', v_payment.id,
        'stripe_payment_intent_id', p_stripe_payment_intent_id,
        'booking_status', v_booking.status
      )
    );
  end if;

  if exists (
    select 1 from public.booking_refunds r where r.payment_id = v_payment.id
  ) then
    return 'already_settled_refund';
  end if;
  return 'refund_owed';
end;
$function$;

-- Automation: expiry job now fires at the 2h response window; the post-accept
-- payment-deadline stage is retired.
create or replace function private.queue_booking_automation_and_email()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_old_status text := case when tg_op = 'UPDATE' then old.status::text else null end;
begin
  if new.booking_flow <> 'hourly_v1' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    perform private.enqueue_booking_automation_job(
      'request_expiration_' || new.id::text, 'request_expiration', new.id, new.id, new.response_alert_at
    );
    perform private.enqueue_participant_email(
      'request_new_' || new.id::text, new.id, 'provider', 'new_provider_request',
      jsonb_build_object('booking_id', new.id)
    );
    return new;
  end if;

  if new.status is not distinct from old.status then
    return new;
  end if;

  case new.status
    when 'declined' then
      perform private.enqueue_participant_email(
        'request_declined_' || new.id::text, new.id, 'customer', 'request_declined',
        jsonb_build_object('booking_id', new.id)
      );
    when 'withdrawn' then
      perform private.enqueue_participant_email(
        'request_withdrawn_' || new.id::text, new.id, 'provider', 'request_withdrawn',
        jsonb_build_object('booking_id', new.id)
      );
    when 'expired' then
      perform private.enqueue_participant_email(
        'request_expired_customer_' || new.id::text, new.id, 'customer', 'request_start_expired',
        jsonb_build_object('booking_id', new.id)
      );
      perform private.enqueue_participant_email(
        'request_expired_provider_' || new.id::text, new.id, 'provider', 'request_start_expired',
        jsonb_build_object('booking_id', new.id)
      );
    when 'booked' then
      perform private.enqueue_participant_email(
        'booked_customer_' || new.id::text, new.id, 'customer', 'booked_first_hour_receipt',
        jsonb_build_object('booking_id', new.id)
      );
      perform private.enqueue_participant_email(
        'booked_provider_' || new.id::text, new.id, 'provider', 'booked_job',
        jsonb_build_object('booking_id', new.id)
      );
    when 'in_progress' then
      perform private.enqueue_participant_email(
        'arrived_customer_' || new.id::text, new.id, 'customer', 'provider_arrived',
        jsonb_build_object('booking_id', new.id)
      );
    when 'cancelled' then
      perform private.enqueue_participant_email(
        'cancelled_customer_' || new.id::text, new.id, 'customer', 'booking_cancelled_customer',
        jsonb_build_object('booking_id', new.id, 'actor', new.cancelled_by_role)
      );
      perform private.enqueue_participant_email(
        'cancelled_provider_' || new.id::text, new.id, 'provider', 'booking_cancelled_provider',
        jsonb_build_object('booking_id', new.id, 'actor', new.cancelled_by_role)
      );
    when 'completed' then
      perform private.enqueue_participant_email(
        'completed_customer_' || new.id::text, new.id, 'customer', 'final_payment_success',
        jsonb_build_object('booking_id', new.id)
      );
      perform private.enqueue_participant_email(
        'completed_provider_' || new.id::text, new.id, 'provider', 'job_completed_paid',
        jsonb_build_object('booking_id', new.id)
      );
    else
      null;
  end case;

  return new;
end;
$function$;
