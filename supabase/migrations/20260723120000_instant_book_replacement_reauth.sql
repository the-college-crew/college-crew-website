-- Instant-book replacement re-authorization.
--
-- Fixes the switch-provider money bug. A first-hour hold is a Stripe destination
-- charge bound to ONE provider's connected account, so it cannot be moved. When a
-- customer quick-books a different provider we therefore place a REAL fresh
-- first-hour hold on the new provider (reusing the authorize-first
-- draft -> finalize path) and release the old, now-useless hold in the app layer.
--
-- This migration:
--   1. Links a replacement draft to the request it supersedes
--      (booking_drafts.original_booking_id).
--   2. Extends create_booking_draft to carry + validate that link.
--   3. Extends finalize_hourly_booking to atomically withdraw the still-open
--      original when its replacement is confirmed.
--   4. Opens replacement candidate suggestions to DECLINED requests, not just
--      timed-out ones.
--
-- Function bodies below are recreated from the CURRENT live definitions (pulled
-- via MCP), not the local migration files, because the remote has diverged
-- (e.g. hourly_replacement_candidate_ids now matches availability against the
-- provider_availability_windows table). Only the intended lines are changed.

-- 1) Link a replacement draft to the request it supersedes.
alter table public.booking_drafts
  add column if not exists original_booking_id uuid
    references public.bookings(id) on delete set null;

-- 2) create_booking_draft gains a trailing p_original_booking_id (default null),
--    validated to be the customer's own still-open or declined hourly request.
--    Drop the 15-arg signature first so there is one unambiguous function.
drop function if exists public.create_booking_draft(uuid, uuid, timestamptz, integer, text, text, text, text, text, public.booking_decline_preference, integer, text, text, double precision, double precision);

create or replace function public.create_booking_draft(
  p_booking_id uuid,
  p_provider_service_id uuid,
  p_scheduled_at timestamptz,
  p_estimated_minutes integer,
  p_details text,
  p_address text,
  p_job_zip text,
  p_address_kind text,
  p_service_city text,
  p_on_decline_preference public.booking_decline_preference,
  p_hourly_rate_cents integer,
  p_stripe_payment_intent_id text,
  p_stripe_customer_id text,
  p_latitude double precision DEFAULT NULL,
  p_longitude double precision DEFAULT NULL,
  p_original_booking_id uuid DEFAULT NULL
)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_actor uuid := (select auth.uid());
begin
  if v_actor is null then raise exception 'AUTH_REQUIRED'; end if;

  -- A replacement's original must be the caller's own hourly request that is
  -- still open (requested) or declined. This is the same authorization boundary
  -- the finalize withdraw relies on.
  if p_original_booking_id is not null then
    if not exists (
      select 1 from public.bookings b
      where b.id = p_original_booking_id
        and b.customer_id = v_actor
        and b.booking_flow = 'hourly_v1'
        and b.status in ('requested', 'declined')
    ) then
      raise exception 'REPLACEMENT_NOT_AVAILABLE_YET';
    end if;
  end if;

  insert into public.booking_drafts (
    booking_id, customer_id, provider_service_id, scheduled_at, estimated_minutes,
    details, address, job_zip, address_kind, service_city, latitude, longitude,
    on_decline_preference, hourly_rate_cents, stripe_payment_intent_id,
    stripe_customer_id, original_booking_id, expires_at
  ) values (
    p_booking_id, v_actor, p_provider_service_id, p_scheduled_at, p_estimated_minutes,
    coalesce(p_details, ''), p_address, p_job_zip, coalesce(p_address_kind, 'home'),
    coalesce(p_service_city, ''), p_latitude, p_longitude,
    coalesce(p_on_decline_preference, 'keep_control'), p_hourly_rate_cents,
    p_stripe_payment_intent_id, p_stripe_customer_id, p_original_booking_id,
    statement_timestamp() + interval '1 hour'
  );
end;
$function$;

grant execute on function public.create_booking_draft(uuid, uuid, timestamptz, integer, text, text, text, text, text, public.booking_decline_preference, integer, text, text, double precision, double precision, uuid) to authenticated;

-- 3) finalize_hourly_booking: after the replacement booking + its authorized hold
--    are created, atomically withdraw the still-open original. Only the added
--    block near the end differs from the live definition.
create or replace function public.finalize_hourly_booking(p_stripe_payment_intent_id text)
 returns uuid
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_actor uuid := (select auth.uid());
  v_draft public.booking_drafts%rowtype;
  v_booking_id uuid;
  v_connected_account text;
  v_fee_cents integer;
  v_auth_version text;
begin
  if v_actor is null then raise exception 'AUTH_REQUIRED'; end if;

  select d.* into v_draft
  from public.booking_drafts d
  where d.stripe_payment_intent_id = p_stripe_payment_intent_id
    and d.customer_id = v_actor
  for update;
  if not found then raise exception 'DRAFT_NOT_FOUND'; end if;

  -- Idempotency: if the booking already exists (double-submit), just return it.
  if exists (select 1 from public.bookings b where b.id = v_draft.booking_id) then
    delete from public.booking_drafts where id = v_draft.id;
    return v_draft.booking_id;
  end if;

  perform private.assert_can_book_hourly(v_draft.provider_service_id);

  perform set_config('college_crew.hourly_legal_publication', 'on', true);
  v_booking_id := private.create_hourly_booking_request_unchecked(
    v_draft.provider_service_id, v_draft.scheduled_at, v_draft.estimated_minutes,
    2, v_draft.address, v_draft.job_zip, v_draft.details,
    v_draft.address_kind, v_draft.service_city, v_draft.latitude, v_draft.longitude,
    v_draft.on_decline_preference, v_draft.booking_id
  );

  select pp.stripe_account_id, b.customer_authorization_version
  into v_connected_account, v_auth_version
  from public.bookings b
  join public.provider_profiles pp on pp.id = b.provider_id
  where b.id = v_booking_id;
  if coalesce(btrim(v_connected_account), '') = '' then
    raise exception 'PROVIDER_NOT_PAYOUT_READY';
  end if;

  v_fee_cents := ((v_draft.hourly_rate_cents::bigint * 500 + 5000) / 10000)::integer;

  insert into public.booking_payments (
    booking_id, kind, amount_cents, application_fee_cents, currency, status,
    idempotency_key, stripe_connected_account_id, stripe_payment_intent_id,
    stripe_customer_id, customer_authorization_version, authorized_at
  ) values (
    v_booking_id, 'first_hour', v_draft.hourly_rate_cents, v_fee_cents, 'usd', 'authorized',
    'fh_' || v_booking_id::text, v_connected_account, p_stripe_payment_intent_id,
    v_draft.stripe_customer_id, v_auth_version, statement_timestamp()
  );

  -- Instant-book replacement: this booking supersedes an earlier request. Withdraw
  -- the still-open original atomically so the customer never holds two live
  -- requests for the same job. A declined original is already terminal and is left
  -- as-is (only 'requested' -> 'withdrawn' is a legal hourly transition, so the
  -- update simply matches no rows for a declined/expired original). The old Stripe
  -- hold is released in the app layer after this RPC returns.
  if v_draft.original_booking_id is not null then
    perform set_config('college_crew.trusted_booking_operation', 'on', true);
    update public.bookings
    set status = 'withdrawn',
        withdrawn_at = statement_timestamp(),
        withdrawn_by = v_actor
    where id = v_draft.original_booking_id
      and customer_id = v_actor
      and booking_flow = 'hourly_v1'
      and status = 'requested';
  end if;

  delete from public.booking_drafts where id = v_draft.id;
  return v_booking_id;
end;
$function$;

-- 4) hourly_replacement_candidate_ids: surface alternatives for a DECLINED request
--    immediately, in addition to a timed-out one. Recreated from the live
--    definition (availability matched against provider_availability_windows); only
--    the status/timing gate is changed.
create or replace function public.hourly_replacement_candidate_ids(p_booking_id uuid)
 returns table(provider_service_id uuid, provider_id uuid)
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_actor uuid := (select auth.uid());
  v_now timestamptz := statement_timestamp();
  v_booking public.bookings%rowtype;
  v_local_start timestamp;
  v_local_end timestamp;
begin
  select b.* into v_booking
  from public.bookings b
  where b.id = p_booking_id
    and b.booking_flow = 'hourly_v1'
    and b.customer_id = v_actor;
  if not found then
    raise exception 'BOOKING_NOT_FOUND';
  end if;
  -- Surface alternatives for a timed-out request (still 'requested', past its
  -- response window) or a declined one (immediately). A past-start job never does.
  if v_booking.status not in ('requested', 'declined') or v_booking.scheduled_at <= v_now then
    return;
  end if;
  if v_booking.status = 'requested' and v_now < v_booking.response_alert_at then
    raise exception 'REPLACEMENT_NOT_AVAILABLE_YET';
  end if;

  v_local_start := v_booking.scheduled_at at time zone 'America/Chicago';
  v_local_end := (
    v_booking.scheduled_at + make_interval(mins => v_booking.estimated_minutes)
  ) at time zone 'America/Chicago';

  return query
  select ps.id, pp.id
  from public.provider_services ps
  join public.provider_profiles pp on pp.id = ps.provider_id
  join public.services s on s.id = ps.service_id
  left join public.provider_ratings pr on pr.provider_id = pp.id
  where ps.service_id = v_booking.service_id
    and pp.id <> v_booking.provider_id
    and pp.verification_status = 'approved'
    and pp.stripe_account_id is not null
    and pp.stripe_transfers_active
    and pp.stripe_transfers_checked_at is not null
    and pp.service_zip is not null
    and ps.hourly_rate_cents between 2000 and 15000
    and s.is_live
    and v_booking.scheduled_at >=
      v_now + make_interval(hours => pp.minimum_notice_hours)
    and v_local_start::date = v_local_end::date
    and exists (
      select 1
      from public.provider_availability_windows w
      where w.provider_id = pp.id
        and w.weekday = extract(isodow from v_local_start)::integer - 1
        and v_local_start::time >= w.start_local
        and v_local_end::time <= w.end_local
    )
    and not private.provider_has_reserved_slot_conflict(
      pp.id,
      v_booking.scheduled_at,
      v_booking.estimated_minutes,
      null
    )
  order by
    (pp.service_zip = v_booking.job_zip) desc,
    coalesce(pr.avg_rating, 0) desc,
    ps.hourly_rate_cents,
    lower(pp.display_name),
    pp.id;
end;
$function$;
