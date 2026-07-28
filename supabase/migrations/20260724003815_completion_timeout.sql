-- Job-day completion timeout: 24h after the student marks Arrived with no
-- invoice submitted, bill the ORIGINAL ESTIMATE automatically.
--
-- The customer still gets their normal 24h invoice review afterwards (the
-- invoice trigger schedules `invoice_autocharge` exactly as it does for a
-- hand-submitted invoice), so this only removes the case where a job sits in
-- `in_progress` forever because the student never opened the form.
--
-- `submit_job_invoice` requires a signed-in provider (auth.uid() + ownership),
-- so the scheduler cannot call it. `auto_complete_hourly_job` is the system
-- twin: same money math, no actor, service_role only.
--
-- Bodies recreated from the CURRENT LIVE definitions (pulled via MCP).

-- 1) Allow the new job kind.
alter table public.booking_automation_jobs
  drop constraint if exists booking_automation_jobs_kind_valid;
alter table public.booking_automation_jobs
  add constraint booking_automation_jobs_kind_valid
  check (kind = any (array[
    'response_alert', 'request_expiration', 'payment_expiration',
    'invoice_autocharge', 'completion_timeout'
  ]));

-- 2) Schedule the timeout when work actually starts. Only the added enqueue at
--    the end differs from the live definition.
create or replace function public.mark_booking_arrived(p_booking_id uuid)
 returns text
 language plpgsql
 security definer
 set search_path to ''
as $function$
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
  if v_booking.status = 'in_progress' then
    return 'in_progress';
  end if;
  if v_booking.status <> 'booked' then
    raise exception 'BOOKING_NOT_BOOKED:%', v_booking.status;
  end if;
  if v_now < v_booking.scheduled_at - interval '30 minutes' then
    raise exception 'ARRIVAL_TOO_EARLY';
  end if;

  perform set_config('college_crew.trusted_booking_operation', 'on', true);
  update public.bookings
  set status = 'in_progress', arrived_at = v_now
  where id = p_booking_id and status = 'booked';

  insert into public.booking_audit_events (
    booking_id, actor_user_id, actor_kind, action, from_status, to_status, metadata
  )
  values (
    p_booking_id, v_actor, 'provider', 'provider_arrived', 'booked', 'in_progress',
    jsonb_build_object('arrived_at', v_now, 'scheduled_at', v_booking.scheduled_at)
  );

  -- If no invoice is submitted within 24h, bill the original estimate.
  perform private.enqueue_booking_automation_job(
    'completion_timeout_' || p_booking_id::text,
    'completion_timeout',
    p_booking_id,
    p_booking_id,
    v_now + interval '24 hours'
  );

  return 'in_progress';
end;
$function$;

-- 3) The system twin of submit_job_invoice: no actor, bills the estimate.
create or replace function public.auto_complete_hourly_job(p_booking_id uuid)
 returns uuid
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_now timestamptz := statement_timestamp();
  v_booking public.bookings%rowtype;
  v_existing uuid;
  v_minutes integer;
  v_rate integer;
  v_bps smallint;
  v_subtotal integer;
  v_total_fee integer;
  v_remaining integer;
  v_invoice_id uuid;
begin
  select b.* into v_booking
  from public.bookings b
  where b.id = p_booking_id
  for update of b;
  if not found then
    raise exception 'BOOKING_NOT_FOUND';
  end if;
  if v_booking.booking_flow <> 'hourly_v1' then
    raise exception 'NOT_HOURLY_BOOKING';
  end if;

  -- Idempotent: a provider who submitted in the meantime always wins.
  select bi.id into v_existing
  from public.booking_invoices bi
  where bi.booking_id = p_booking_id;
  if v_existing is not null then
    return v_existing;
  end if;

  -- Anything that already moved on (completed, disputed, cancelled) is a no-op.
  if v_booking.status <> 'in_progress' then
    return null;
  end if;
  -- Belt and braces: never fire early even if the job was scheduled wrong.
  if v_booking.arrived_at is null
    or v_booking.arrived_at > v_now - interval '24 hours' then
    raise exception 'COMPLETION_NOT_DUE';
  end if;

  -- The diagram's rule: with no submitted form, the original estimate stands.
  -- Clamped to the invoice bounds/step so an odd legacy estimate can't produce
  -- an invoice the manual path would have rejected.
  v_minutes := greatest(60, least(1440, (v_booking.estimated_minutes / 15) * 15));

  v_rate := v_booking.hourly_rate_cents_snapshot;
  v_bps := v_booking.platform_fee_bps;
  v_subtotal := ((v_rate::bigint * v_minutes + 30) / 60)::integer;
  v_total_fee := ((v_subtotal::bigint * v_bps + 5000) / 10000)::integer;
  v_remaining := greatest(0, v_subtotal - v_rate);

  perform set_config('college_crew.trusted_booking_operation', 'on', true);
  update public.bookings
  set status = 'invoice_review', work_completed_at = v_now
  where id = p_booking_id and status = 'in_progress';

  insert into public.booking_invoices (
    booking_id, submitted_minutes, estimated_minutes_snapshot,
    hourly_rate_cents_snapshot, platform_fee_bps_snapshot, provider_explanation,
    subtotal_cents, total_platform_fee_cents, first_hour_credit_cents,
    remaining_balance_cents, status, submitted_at, autocharge_at
  )
  values (
    p_booking_id, v_minutes, v_booking.estimated_minutes,
    v_rate, v_bps, '',
    v_subtotal, v_total_fee, v_rate,
    v_remaining, 'review', v_now, v_now + interval '24 hours'
  )
  returning id into v_invoice_id;

  insert into public.booking_audit_events (
    booking_id, actor_user_id, actor_kind, action, from_status, to_status, metadata
  )
  values (
    p_booking_id, null, 'system', 'job_auto_completed_invoice_submitted',
    'in_progress', 'invoice_review',
    jsonb_build_object(
      'invoice_id', v_invoice_id,
      'submitted_minutes', v_minutes,
      'subtotal_cents', v_subtotal,
      'remaining_balance_cents', v_remaining,
      'reason', 'completion_timeout'
    )
  );
  return v_invoice_id;
end;
$function$;

revoke all on function public.auto_complete_hourly_job(uuid) from public, anon, authenticated;
grant execute on function public.auto_complete_hourly_job(uuid) to service_role;
