-- Cash settlement, part 2 of 2: the paid-in-person closeout.
--
-- The customer settled with the student directly, so the platform does NOT
-- charge the job amount. It keeps only its rake, taken from the first hour it
-- already captured, and pays the student the remainder — which under the
-- held-funds model is just the ordinary `provider_payout` job with no balance
-- charge to pass through. No clawback, no second money path.
--
--   collected = first hour   payout = first hour - rake
--
-- Safety: the invoice is written with status 'cash_settled' AND a NULL
-- autocharge_at, so `claim_due_invoice` (which requires status='review' and a
-- non-null autocharge_at) can never charge a customer who already paid in cash.

alter table public.bookings
  add column if not exists cash_settled_at timestamptz;

-- Provider-attested cash closeout. Mirrors submit_job_invoice's money math and
-- guards exactly, then settles instead of billing.
create or replace function public.settle_job_in_cash(
  p_booking_id uuid,
  p_submitted_minutes integer,
  p_provider_explanation text default '',
  p_confirmed boolean default false
)
 returns uuid
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_actor uuid := (select auth.uid());
  v_now timestamptz := statement_timestamp();
  v_booking public.bookings%rowtype;
  v_existing uuid;
  v_explanation text := coalesce(btrim(p_provider_explanation), '');
  v_rate integer;
  v_bps smallint;
  v_subtotal integer;
  v_total_fee integer;
  v_remaining integer;
  v_invoice_id uuid;
begin
  if v_actor is null then
    raise exception 'AUTH_REQUIRED';
  end if;
  -- The one-tap attestation is the whole control on this path: it is the only
  -- record that the customer actually handed over money off-platform.
  if not coalesce(p_confirmed, false) then
    raise exception 'CASH_CONFIRMATION_REQUIRED';
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

  select bi.id into v_existing
  from public.booking_invoices bi
  where bi.booking_id = p_booking_id;
  if v_existing is not null then
    return v_existing;
  end if;

  if v_booking.status <> 'in_progress' then
    raise exception 'BOOKING_NOT_IN_PROGRESS:%', v_booking.status;
  end if;
  if p_submitted_minutes < 60 or p_submitted_minutes > 1440
    or p_submitted_minutes % 15 <> 0 then
    raise exception 'INVALID_MINUTES:%', p_submitted_minutes;
  end if;
  if p_submitted_minutes > v_booking.estimated_minutes and v_explanation = '' then
    raise exception 'OVERAGE_EXPLANATION_REQUIRED';
  end if;

  v_rate := v_booking.hourly_rate_cents_snapshot;
  v_bps := v_booking.platform_fee_bps;
  v_subtotal := ((v_rate::bigint * p_submitted_minutes + 30) / 60)::integer;
  v_total_fee := ((v_subtotal::bigint * v_bps + 5000) / 10000)::integer;
  -- Recorded for the books: what the customer settled directly with the student.
  v_remaining := greatest(0, v_subtotal - v_rate);

  perform set_config('college_crew.trusted_booking_operation', 'on', true);

  -- in_progress -> invoice_review -> completed. The direct hop is not a legal
  -- transition, and going through review keeps the state machine honest.
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
    p_booking_id, p_submitted_minutes, v_booking.estimated_minutes,
    v_rate, v_bps, v_explanation,
    v_subtotal, v_total_fee, v_rate,
    v_remaining, 'cash_settled', v_now, null
  )
  returning id into v_invoice_id;

  update public.bookings
  set status = 'completed', cash_settled_at = v_now
  where id = p_booking_id and status = 'invoice_review';

  insert into public.booking_audit_events (
    booking_id, actor_user_id, actor_kind, action, from_status, to_status, metadata
  )
  values (
    p_booking_id, v_actor, 'provider', 'job_settled_in_cash',
    'in_progress', 'completed',
    jsonb_build_object(
      'invoice_id', v_invoice_id,
      'submitted_minutes', p_submitted_minutes,
      'subtotal_cents', v_subtotal,
      'settled_in_cash_cents', v_remaining,
      'platform_rake_cents', v_total_fee
    )
  );

  return v_invoice_id;
end;
$function$;

revoke all on function public.settle_job_in_cash(uuid, integer, text, boolean)
  from public, anon;
grant execute on function public.settle_job_in_cash(uuid, integer, text, boolean)
  to authenticated;
