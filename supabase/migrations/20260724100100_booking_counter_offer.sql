-- Time-flexibility + provider counter-offer, part 2 of 2.
--
-- The customer chooses, per booking, whether the student may propose a different
-- time. If they chose 'flexible', the provider can COUNTER instead of only
-- accept/decline; the customer then accepts (the job moves to the proposed time
-- and the EXISTING hold is captured — same provider, so the hold never moves) or
-- rejects (the request becomes 'declined', which surfaces the ranked alternatives
-- + one-tap quick-book built in the previous migration).
--
-- No customer deadline on a counter, by decision. The backstop is the existing
-- `request_expiration` job at the ORIGINAL scheduled_at: if the customer never
-- answers, the request expires there and the hold is released, so funds are never
-- held past the slot the customer originally asked for.
--
-- Function bodies are recreated from the CURRENT LIVE definitions (pulled via
-- MCP), not the local migration files — the remote has diverged before (e.g.
-- enforce_booking_transition now covers 'quote_v1', which the repo copy does not).
-- Only the intended lines differ.

-- ---------------------------------------------------------------- columns ----
alter table public.bookings
  add column if not exists time_flexibility public.booking_time_flexibility
    not null default 'fixed',
  add column if not exists proposed_start_at timestamptz,
  add column if not exists counter_note text,
  add column if not exists countered_at timestamptz;

alter table public.booking_drafts
  add column if not exists time_flexibility public.booking_time_flexibility
    not null default 'fixed';

-- ------------------------------------------------------ transition guard ----
-- Adds requested -> countered and the countered -> * exits. Everything else is
-- the live definition verbatim.
create or replace function public.enforce_booking_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor_is_provider boolean;
  actor_is_customer boolean;
  trusted_hourly_operation boolean :=
    coalesce(current_setting('college_crew.trusted_booking_operation', true), '') = 'on';
begin
  if new.status = old.status then
    return new;
  end if;

  if old.booking_flow in ('legacy', 'quote_v1') then
    if not (
      (old.status = 'requested' and new.status in ('accepted', 'declined', 'cancelled')) or
      (old.status = 'accepted' and new.status in ('paid', 'cancelled')) or
      (old.status = 'paid' and new.status = 'completed')
    ) then
      raise exception 'illegal full-price booking transition: % -> %', old.status, new.status;
    end if;

    if (select auth.uid()) is null then
      return new;
    end if;

    actor_is_provider := exists (
      select 1 from public.provider_profiles
      where id = new.provider_id and user_id = (select auth.uid())
    );
    actor_is_customer := new.customer_id = (select auth.uid());

    if new.status in ('accepted', 'declined', 'completed') and not actor_is_provider then
      raise exception 'only the provider can set status %', new.status;
    end if;
    if new.status in ('cancelled', 'paid') and not actor_is_customer then
      raise exception 'only the customer can set status %', new.status;
    end if;
    return new;
  end if;

  if (select auth.uid()) is not null and not trusted_hourly_operation then
    raise exception 'hourly booking transitions require a trusted operation';
  end if;

  if not (
    (old.status = 'requested' and new.status in (
      'accepted', 'declined', 'withdrawn', 'expired', 'cancelled', 'countered'
    )) or
    (old.status = 'countered' and new.status in (
      'accepted', 'declined', 'withdrawn', 'expired', 'cancelled'
    )) or
    (old.status = 'accepted' and new.status in ('booked', 'expired', 'cancelled')) or
    (old.status = 'booked' and new.status in ('in_progress', 'disputed', 'cancelled')) or
    (old.status = 'in_progress' and new.status in ('invoice_review', 'disputed')) or
    (old.status = 'invoice_review' and new.status in ('completed', 'disputed')) or
    (old.status = 'disputed' and new.status in ('completed', 'cancelled'))
  ) then
    raise exception 'illegal hourly booking transition: % -> %', old.status, new.status;
  end if;

  return new;
end;
$function$;

-- --------------------------------------------------- draft carries choice ----
-- Gains a trailing p_time_flexibility. p_on_decline_preference stays required
-- (a default there would sit before non-defaulted params); the customer-facing
-- control for it is retired, so callers now pass the 'keep_control' constant.
drop function if exists public.create_booking_draft(uuid, uuid, timestamptz, integer, text, text, text, text, text, public.booking_decline_preference, integer, text, text, double precision, double precision, uuid);

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
  p_original_booking_id uuid DEFAULT NULL,
  p_time_flexibility public.booking_time_flexibility DEFAULT 'fixed'
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
    stripe_customer_id, original_booking_id, time_flexibility, expires_at
  ) values (
    p_booking_id, v_actor, p_provider_service_id, p_scheduled_at, p_estimated_minutes,
    coalesce(p_details, ''), p_address, p_job_zip, coalesce(p_address_kind, 'home'),
    coalesce(p_service_city, ''), p_latitude, p_longitude,
    coalesce(p_on_decline_preference, 'keep_control'), p_hourly_rate_cents,
    p_stripe_payment_intent_id, p_stripe_customer_id, p_original_booking_id,
    coalesce(p_time_flexibility, 'fixed'),
    statement_timestamp() + interval '1 hour'
  );
end;
$function$;

grant execute on function public.create_booking_draft(uuid, uuid, timestamptz, integer, text, text, text, text, text, public.booking_decline_preference, integer, text, text, double precision, double precision, uuid, public.booking_time_flexibility) to authenticated;

-- ------------------------------------------- creator persists the choice ----
-- Trailing p_time_flexibility; existing 13-arg positional calls still resolve.
drop function if exists private.create_hourly_booking_request_unchecked(uuid, timestamptz, integer, integer, text, text, text, text, text, double precision, double precision, public.booking_decline_preference, uuid);

create or replace function private.create_hourly_booking_request_unchecked(
  p_provider_service_id uuid,
  p_scheduled_at timestamp with time zone,
  p_estimated_minutes integer,
  p_response_window_hours integer,
  p_address text,
  p_job_zip text,
  p_details text DEFAULT ''::text,
  p_address_kind text DEFAULT 'home'::text,
  p_service_city text DEFAULT ''::text,
  p_latitude double precision DEFAULT NULL::double precision,
  p_longitude double precision DEFAULT NULL::double precision,
  p_on_decline_preference public.booking_decline_preference DEFAULT 'keep_control'::public.booking_decline_preference,
  p_booking_id uuid DEFAULT NULL::uuid,
  p_time_flexibility public.booking_time_flexibility DEFAULT 'fixed'
)
 returns uuid
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_actor uuid := (select auth.uid());
  v_now timestamptz := statement_timestamp();
  v_customer_name text;
  v_offering record;
  v_booking_id uuid;
begin
  if v_actor is null then
    raise exception 'AUTHENTICATION_REQUIRED';
  end if;
  if not exists (
    select 1 from auth.users u
    where u.id = v_actor and u.email_confirmed_at is not null
  ) then
    raise exception 'EMAIL_CONFIRMATION_REQUIRED';
  end if;

  select nullif(btrim(p.full_name), '')
  into v_customer_name
  from public.profiles p
  where p.id = v_actor;
  if v_customer_name is null then
    raise exception 'CUSTOMER_NAME_REQUIRED';
  end if;
  if p_response_window_hours not in (1, 2, 3, 5, 12, 24, 48, 72) then
    raise exception 'INVALID_RESPONSE_WINDOW';
  end if;
  if v_now + make_interval(hours => p_response_window_hours) >= p_scheduled_at then
    raise exception 'RESPONSE_WINDOW_REACHES_START';
  end if;
  if p_job_zip is null or p_job_zip !~ '^[0-9]{5}$' then
    raise exception 'INVALID_JOB_ZIP';
  end if;
  if char_length(btrim(coalesce(p_address, ''))) < 5
    or char_length(btrim(p_address)) > 500 then
    raise exception 'INVALID_JOB_ADDRESS';
  end if;
  if char_length(btrim(coalesce(p_details, ''))) > 2000 then
    raise exception 'DETAILS_TOO_LONG';
  end if;
  if p_address_kind not in ('home', 'other') then
    raise exception 'INVALID_ADDRESS_KIND';
  end if;
  if char_length(btrim(coalesce(p_service_city, ''))) > 120 then
    raise exception 'INVALID_SERVICE_CITY';
  end if;
  if (p_latitude is null) <> (p_longitude is null)
    or (p_latitude is not null and (p_latitude < -90 or p_latitude > 90))
    or (p_longitude is not null and (p_longitude < -180 or p_longitude > 180)) then
    raise exception 'INVALID_COORDINATES';
  end if;

  select * into v_offering
  from private.assert_hourly_offering_slot(
    p_provider_service_id,
    p_scheduled_at,
    p_estimated_minutes,
    v_now,
    null
  );

  insert into public.bookings (
    id, customer_id, provider_id, service_id, status, scheduled_at, address,
    details, price_cents, platform_fee_cents, created_at, booking_flow,
    estimated_minutes, job_zip, address_kind, service_city, latitude, longitude,
    hourly_rate_cents_snapshot, platform_fee_bps, billing_minimum_minutes,
    billing_increment_minutes, cancellation_notice_hours, pilot_timezone,
    response_window_hours, response_alert_at, on_decline_preference,
    time_flexibility,
    customer_name_snapshot, provider_display_name_snapshot, service_name_snapshot,
    fee_policy_version, cancellation_policy_version, terms_version,
    customer_authorization_version, policy_snapshot, customer_authorization_snapshot
  ) values (
    coalesce(p_booking_id, gen_random_uuid()),
    v_actor,
    v_offering.provider_id,
    v_offering.service_id,
    'requested',
    p_scheduled_at,
    btrim(p_address),
    btrim(coalesce(p_details, '')),
    v_offering.hourly_rate_cents,
    round(v_offering.hourly_rate_cents::numeric * 500 / 10000)::integer,
    v_now,
    'hourly_v1',
    p_estimated_minutes,
    p_job_zip,
    p_address_kind,
    btrim(coalesce(p_service_city, '')),
    p_latitude,
    p_longitude,
    v_offering.hourly_rate_cents,
    500,
    60,
    15,
    12,
    'America/Chicago',
    p_response_window_hours,
    v_now + make_interval(hours => p_response_window_hours),
    coalesce(p_on_decline_preference, 'keep_control'),
    coalesce(p_time_flexibility, 'fixed'),
    v_customer_name,
    v_offering.provider_display_name,
    v_offering.service_name,
    'hourly-v1-500bps',
    'hourly-v1-12h',
    '2026-07-08',
    'hourly-v1-saved-method',
    jsonb_build_object(
      'platform_fee_bps', 500,
      'billing_minimum_minutes', 60,
      'billing_increment_minutes', 15,
      'cancellation_notice_hours', 12,
      'pilot_timezone', 'America/Chicago'
    ),
    jsonb_build_object(
      'version', 'hourly-v1-saved-method',
      'scope', 'booking_only',
      'saved_method_authorization_required_at_payment', true
    )
  )
  returning id into v_booking_id;

  return v_booking_id;
end;
$function$;

-- ------------------------------------------------ finalize passes it on ----
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
    v_draft.on_decline_preference, v_draft.booking_id, v_draft.time_flexibility
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

-- --------------------------------------------- expiry covers 'countered' ----
-- A countered request has no customer deadline, so its backstop is the ORIGINAL
-- scheduled start rather than response_alert_at (which already passed when the
-- provider countered). Reaching it expires the request and frees the hold.
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
  if v_booking.status not in ('requested', 'countered') then
    return p_booking_id;
  end if;
  if v_booking.status = 'requested' then
    if coalesce(v_booking.response_alert_at, v_booking.scheduled_at) > v_now then
      raise exception 'REQUEST_NOT_DUE_TO_EXPIRE';
    end if;
  else
    if v_booking.scheduled_at > v_now then
      raise exception 'REQUEST_NOT_DUE_TO_EXPIRE';
    end if;
  end if;
  perform set_config('college_crew.trusted_booking_operation', 'on', true);
  update public.bookings
  set status = 'expired', expired_at = v_now
  where id = p_booking_id and status in ('requested', 'countered');
  return p_booking_id;
end;
$function$;

-- ------------------------------------------------- provider counters ---------
create or replace function public.counter_hourly_booking_request(
  p_booking_id uuid,
  p_proposed_start_at timestamptz,
  p_note text DEFAULT ''
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
  v_provider_service_id uuid;
  v_offering record;
begin
  select b.* into v_booking
  from public.bookings b
  join public.provider_profiles pp on pp.id = b.provider_id
  where b.id = p_booking_id and pp.user_id = v_actor
  for update of b;
  if not found then
    raise exception 'BOOKING_NOT_FOUND';
  end if;
  if v_booking.booking_flow <> 'hourly_v1' then
    raise exception 'NOT_HOURLY_BOOKING';
  end if;
  if v_booking.status <> 'requested' then
    raise exception 'REQUEST_NO_LONGER_OPEN:%', v_booking.status;
  end if;
  if v_booking.time_flexibility <> 'flexible' then
    raise exception 'COUNTER_NOT_ALLOWED';
  end if;
  if char_length(btrim(coalesce(p_note, ''))) > 500 then
    raise exception 'COUNTER_NOTE_TOO_LONG';
  end if;
  -- Same expiry guards the accept path applies.
  if v_booking.scheduled_at <= v_now
    or (v_booking.response_alert_at is not null and v_booking.response_alert_at <= v_now) then
    perform set_config('college_crew.trusted_booking_operation', 'on', true);
    update public.bookings
    set status = 'expired', expired_at = v_now
    where id = p_booking_id and status = 'requested';
    raise exception 'REQUEST_EXPIRED';
  end if;
  if p_proposed_start_at is null or p_proposed_start_at <= v_now then
    raise exception 'INVALID_PROPOSED_TIME';
  end if;
  if p_proposed_start_at = v_booking.scheduled_at then
    raise exception 'PROPOSED_TIME_UNCHANGED';
  end if;

  select ps.id into v_provider_service_id
  from public.provider_services ps
  where ps.provider_id = v_booking.provider_id
    and ps.service_id = v_booking.service_id
  limit 1;
  if v_provider_service_id is null then
    raise exception 'OFFERING_NOT_BOOKABLE';
  end if;

  -- Validates bookable + availability window + minimum notice at the NEW time.
  -- The booking keeps its locked rate snapshot: a counter moves the time only,
  -- so the existing hold stays valid and is never re-priced.
  select * into v_offering
  from private.assert_hourly_offering_slot(
    v_provider_service_id,
    p_proposed_start_at,
    v_booking.estimated_minutes,
    v_now,
    v_booking.service_id
  );

  perform pg_advisory_xact_lock(hashtextextended(v_booking.provider_id::text, 0));
  if private.provider_has_reserved_slot_conflict(
    v_booking.provider_id,
    p_proposed_start_at,
    v_booking.estimated_minutes,
    v_booking.id
  ) then
    raise exception 'PROVIDER_SLOT_ALREADY_RESERVED';
  end if;

  perform set_config('college_crew.trusted_booking_operation', 'on', true);
  update public.bookings
  set status = 'countered',
      proposed_start_at = p_proposed_start_at,
      counter_note = nullif(btrim(coalesce(p_note, '')), ''),
      countered_at = v_now
  where id = p_booking_id and status = 'requested';
  if not found then
    raise exception 'REQUEST_NO_LONGER_OPEN';
  end if;

  perform private.enqueue_participant_email(
    'counter_offer_' || p_booking_id::text,
    p_booking_id,
    'customer',
    'counter_offer_received',
    jsonb_build_object('recipient_kind', 'customer')
  );

  return p_booking_id;
end;
$function$;

-- ------------------------------------------- customer accepts the new time ---
create or replace function public.accept_hourly_counter_offer(p_booking_id uuid)
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
  where b.id = p_booking_id
    and b.customer_id = v_actor
    and b.booking_flow = 'hourly_v1'
  for update;
  if not found then
    raise exception 'BOOKING_NOT_FOUND';
  end if;
  if v_booking.status <> 'countered' then
    raise exception 'REQUEST_NO_LONGER_OPEN:%', v_booking.status;
  end if;
  if v_booking.proposed_start_at is null then
    raise exception 'INVALID_PROPOSED_TIME';
  end if;
  if v_booking.proposed_start_at <= v_now then
    perform set_config('college_crew.trusted_booking_operation', 'on', true);
    update public.bookings
    set status = 'expired', expired_at = v_now
    where id = p_booking_id and status = 'countered';
    raise exception 'REQUEST_EXPIRED';
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
    v_booking.proposed_start_at,
    v_booking.estimated_minutes,
    v_booking.id
  ) then
    raise exception 'PROVIDER_SLOT_ALREADY_RESERVED';
  end if;

  -- Same provider, new time: move the job and accept. The caller captures the
  -- EXISTING first-hour hold — no re-authorization is needed or wanted.
  perform set_config('college_crew.trusted_booking_operation', 'on', true);
  update public.bookings
  set status = 'accepted',
      accepted_at = v_now,
      scheduled_at = v_booking.proposed_start_at
  where id = p_booking_id and status = 'countered';
  if not found then
    raise exception 'REQUEST_NO_LONGER_OPEN';
  end if;
  return p_booking_id;
end;
$function$;

-- ------------------------------------------- customer rejects the new time ---
-- Treated as the student not taking the job: 'declined' is what surfaces the
-- ranked alternatives + one-tap quick-book.
create or replace function public.reject_hourly_counter_offer(p_booking_id uuid)
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
  where b.id = p_booking_id
    and b.customer_id = v_actor
    and b.booking_flow = 'hourly_v1'
  for update;
  if not found then
    raise exception 'BOOKING_NOT_FOUND';
  end if;
  if v_booking.status <> 'countered' then
    raise exception 'REQUEST_NO_LONGER_OPEN:%', v_booking.status;
  end if;

  perform set_config('college_crew.trusted_booking_operation', 'on', true);
  update public.bookings
  set status = 'declined'
  where id = p_booking_id and status = 'countered';
  if not found then
    raise exception 'REQUEST_NO_LONGER_OPEN';
  end if;
  return p_booking_id;
end;
$function$;

revoke all on function public.counter_hourly_booking_request(uuid, timestamptz, text) from public, anon;
revoke all on function public.accept_hourly_counter_offer(uuid) from public, anon;
revoke all on function public.reject_hourly_counter_offer(uuid) from public, anon;
grant execute on function public.counter_hourly_booking_request(uuid, timestamptz, text) to authenticated;
grant execute on function public.accept_hourly_counter_offer(uuid) to authenticated;
grant execute on function public.reject_hourly_counter_offer(uuid) to authenticated;
