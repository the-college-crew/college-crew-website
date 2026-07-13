-- Hourly Booking v1, Phase 3: trusted request, response, replacement, and
-- prepayment lifecycle. Stripe and invoice work intentionally remain absent.

set lock_timeout = '10s';
set statement_timeout = '2min';

alter table public.bookings
  add column response_alerted_at timestamptz,
  add constraint bookings_response_alerted_after_threshold check (
    response_alerted_at is null
    or (
      response_alert_at is not null
      and response_alerted_at >= response_alert_at
    )
  );

create index bookings_provider_reserved_slot_idx
  on public.bookings (provider_id, scheduled_at)
  where status in (
    'accepted', 'paid', 'booked', 'in_progress', 'invoice_review', 'disputed'
  );

create function private.provider_has_reserved_slot_conflict(
  p_provider_id uuid,
  p_scheduled_at timestamptz,
  p_estimated_minutes integer,
  p_exclude_booking_id uuid default null
)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.bookings b
    where b.provider_id = p_provider_id
      and b.status in (
        'accepted', 'paid', 'booked', 'in_progress', 'invoice_review', 'disputed'
      )
      and (p_exclude_booking_id is null or b.id <> p_exclude_booking_id)
      and b.scheduled_at < p_scheduled_at + make_interval(mins => p_estimated_minutes)
      and b.scheduled_at + make_interval(mins => coalesce(b.estimated_minutes, 60))
        > p_scheduled_at
  );
$$;

revoke execute on function private.provider_has_reserved_slot_conflict(
  uuid, timestamptz, integer, uuid
) from public, anon, authenticated, service_role;

create function private.assert_hourly_offering_slot(
  p_provider_service_id uuid,
  p_scheduled_at timestamptz,
  p_estimated_minutes integer,
  p_now timestamptz,
  p_expected_service_id uuid default null
)
returns table (
  provider_id uuid,
  service_id uuid,
  hourly_rate_cents integer,
  provider_display_name text,
  service_name text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_weekdays smallint[];
  v_start_local time;
  v_end_local time;
  v_minimum_notice_hours integer;
  v_local_start timestamp;
  v_local_end timestamp;
begin
  if p_estimated_minutes < 60
    or p_estimated_minutes > 720
    or p_estimated_minutes % 15 <> 0 then
    raise exception 'INVALID_DURATION';
  end if;

  select
    ps.provider_id,
    ps.service_id,
    ps.hourly_rate_cents,
    pp.display_name,
    s.name,
    pp.availability_weekdays,
    pp.availability_start_local,
    pp.availability_end_local,
    pp.minimum_notice_hours
  into
    provider_id,
    service_id,
    hourly_rate_cents,
    provider_display_name,
    service_name,
    v_weekdays,
    v_start_local,
    v_end_local,
    v_minimum_notice_hours
  from public.provider_services ps
  join public.provider_profiles pp on pp.id = ps.provider_id
  join public.services s on s.id = ps.service_id
  where ps.id = p_provider_service_id
    and pp.verification_status = 'approved'
    and pp.stripe_account_id is not null
    and pp.stripe_transfers_active
    and pp.stripe_transfers_checked_at is not null
    and pp.service_zip is not null
    and cardinality(pp.availability_weekdays) > 0
    and pp.availability_start_local is not null
    and pp.availability_end_local is not null
    and ps.hourly_rate_cents between 2000 and 15000
    and s.is_live;

  if provider_id is null then
    raise exception 'OFFERING_NOT_BOOKABLE';
  end if;
  if p_expected_service_id is not null and service_id <> p_expected_service_id then
    raise exception 'REPLACEMENT_SERVICE_MISMATCH';
  end if;
  if nullif(btrim(provider_display_name), '') is null then
    raise exception 'PROVIDER_NAME_REQUIRED';
  end if;
  if p_scheduled_at < p_now + make_interval(hours => v_minimum_notice_hours) then
    raise exception 'MINIMUM_NOTICE_NOT_MET';
  end if;

  v_local_start := p_scheduled_at at time zone 'America/Chicago';
  v_local_end := (
    p_scheduled_at + make_interval(mins => p_estimated_minutes)
  ) at time zone 'America/Chicago';

  if v_local_start::date <> v_local_end::date
    or not ((extract(isodow from v_local_start)::integer - 1) = any(v_weekdays))
    or v_local_start::time < v_start_local
    or v_local_end::time > v_end_local then
    raise exception 'OUTSIDE_PROVIDER_AVAILABILITY';
  end if;

  return next;
end;
$$;

revoke execute on function private.assert_hourly_offering_slot(
  uuid, timestamptz, integer, timestamptz, uuid
) from public, anon, authenticated, service_role;

-- Authenticated RPCs set this transaction-local marker. The transition trigger
-- still rejects direct hourly updates made with an end-user JWT.
create or replace function public.enforce_booking_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_is_provider boolean;
  actor_is_customer boolean;
  trusted_hourly_operation boolean :=
    coalesce(current_setting('college_crew.trusted_booking_operation', true), '') = 'on';
begin
  if new.status = old.status then
    return new;
  end if;

  if old.booking_flow = 'legacy' then
    if not (
      (old.status = 'requested' and new.status in ('accepted', 'declined', 'cancelled')) or
      (old.status = 'accepted' and new.status in ('paid', 'cancelled')) or
      (old.status = 'paid' and new.status = 'completed')
    ) then
      raise exception 'illegal legacy booking transition: % -> %', old.status, new.status;
    end if;

    if (select auth.uid()) is null then
      return new;
    end if;

    actor_is_provider := exists (
      select 1
      from public.provider_profiles
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
$$;

revoke execute on function public.enforce_booking_transition()
  from public, anon, authenticated;

create function private.enforce_phase3_booking_immutability()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.response_alerted_at is not null
    and new.response_alerted_at is distinct from old.response_alerted_at then
    raise exception 'response alert timestamp cannot be rewritten';
  end if;
  return new;
end;
$$;

revoke execute on function private.enforce_phase3_booking_immutability()
  from public, anon, authenticated, service_role;

create trigger booking_phase3_immutable_contract
  before update on public.bookings
  for each row execute function private.enforce_phase3_booking_immutability();

create function public.create_hourly_booking_request(
  p_provider_service_id uuid,
  p_scheduled_at timestamptz,
  p_estimated_minutes integer,
  p_response_window_hours integer,
  p_address text,
  p_job_zip text,
  p_details text default ''
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
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
    select 1 from public.profiles p where p.id = v_actor and p.role = 'customer'
  ) then
    raise exception 'CUSTOMER_ROLE_REQUIRED';
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
  if p_response_window_hours not in (1, 3, 5, 12, 24, 48, 72) then
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

  select * into v_offering
  from private.assert_hourly_offering_slot(
    p_provider_service_id,
    p_scheduled_at,
    p_estimated_minutes,
    v_now,
    null
  );

  insert into public.bookings (
    customer_id,
    provider_id,
    service_id,
    status,
    scheduled_at,
    address,
    details,
    price_cents,
    platform_fee_cents,
    created_at,
    booking_flow,
    estimated_minutes,
    job_zip,
    hourly_rate_cents_snapshot,
    platform_fee_bps,
    billing_minimum_minutes,
    billing_increment_minutes,
    cancellation_notice_hours,
    pilot_timezone,
    response_window_hours,
    response_alert_at,
    customer_name_snapshot,
    provider_display_name_snapshot,
    service_name_snapshot,
    fee_policy_version,
    cancellation_policy_version,
    terms_version,
    customer_authorization_version,
    policy_snapshot,
    customer_authorization_snapshot
  ) values (
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
    v_offering.hourly_rate_cents,
    500,
    60,
    15,
    12,
    'America/Chicago',
    p_response_window_hours,
    v_now + make_interval(hours => p_response_window_hours),
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
$$;

create function public.accept_booking_request(p_booking_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
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
  set
    status = 'accepted',
    accepted_at = v_now,
    initial_payment_due_at = least(v_now + interval '12 hours', scheduled_at)
  where id = p_booking_id and status = 'requested';
  if not found then
    raise exception 'REQUEST_NO_LONGER_OPEN';
  end if;
  return p_booking_id;
end;
$$;

create function public.decline_booking_request(p_booking_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
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
  if v_booking.booking_flow = 'hourly_v1' and v_booking.scheduled_at <= v_now then
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
$$;

create function public.cancel_booking_request(p_booking_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_now timestamptz := statement_timestamp();
  v_booking public.bookings%rowtype;
begin
  select b.* into v_booking
  from public.bookings b
  where b.id = p_booking_id and b.customer_id = v_actor
  for update;
  if not found then
    raise exception 'BOOKING_NOT_FOUND';
  end if;
  if v_booking.status not in ('requested', 'accepted') then
    raise exception 'BOOKING_NO_LONGER_CANCELLABLE:%', v_booking.status;
  end if;

  perform set_config('college_crew.trusted_booking_operation', 'on', true);
  if v_booking.booking_flow = 'legacy' then
    update public.bookings set status = 'cancelled'
    where id = p_booking_id and status in ('requested', 'accepted');
  else
    update public.bookings
    set
      status = 'cancelled',
      cancelled_at = v_now,
      cancelled_by = v_actor,
      cancelled_by_role = 'customer',
      cancellation_reason = 'customer_cancelled_before_payment',
      cancellation_policy_result = 'no_payment'
    where id = p_booking_id and status in ('requested', 'accepted');
  end if;
  if not found then
    raise exception 'BOOKING_NO_LONGER_CANCELLABLE';
  end if;
  return p_booking_id;
end;
$$;

create function public.transition_legacy_booking(
  p_booking_id uuid,
  p_target_status public.booking_status
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_booking public.bookings%rowtype;
  v_is_provider boolean;
begin
  select b.* into v_booking
  from public.bookings b
  where b.id = p_booking_id and b.booking_flow = 'legacy'
  for update;
  if not found then
    raise exception 'LEGACY_BOOKING_NOT_FOUND';
  end if;

  select exists (
    select 1 from public.provider_profiles pp
    where pp.id = v_booking.provider_id and pp.user_id = v_actor
  ) into v_is_provider;

  if p_target_status = 'paid' then
    if v_booking.customer_id <> v_actor or v_booking.status <> 'accepted' then
      raise exception 'LEGACY_TRANSITION_NOT_ALLOWED';
    end if;
  elsif p_target_status = 'completed' then
    if not v_is_provider or v_booking.status <> 'paid' then
      raise exception 'LEGACY_TRANSITION_NOT_ALLOWED';
    end if;
  else
    raise exception 'LEGACY_TRANSITION_NOT_ALLOWED';
  end if;

  update public.bookings set status = p_target_status
  where id = p_booking_id and status = v_booking.status;
  if not found then
    raise exception 'LEGACY_BOOKING_STALE';
  end if;
  return p_booking_id;
end;
$$;

create function public.dismiss_booking(p_booking_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
begin
  update public.bookings
  set dismissed_at = statement_timestamp()
  where id = p_booking_id
    and customer_id = v_actor
    and status = 'declined'
    and dismissed_at is null;
  if not found then
    raise exception 'BOOKING_NOT_DISMISSIBLE';
  end if;
  return p_booking_id;
end;
$$;

create function public.mark_hourly_response_alert(p_booking_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
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
  if v_booking.scheduled_at <= v_now then
    perform set_config('college_crew.trusted_booking_operation', 'on', true);
    update public.bookings
    set status = 'expired', expired_at = v_now
    where id = p_booking_id and status = 'requested';
    return p_booking_id;
  end if;
  if v_now < v_booking.response_alert_at then
    raise exception 'RESPONSE_ALERT_NOT_DUE';
  end if;
  update public.bookings
  set response_alerted_at = coalesce(response_alerted_at, v_now)
  where id = p_booking_id;
  return p_booking_id;
end;
$$;

create function public.expire_hourly_booking_request(p_booking_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
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
  if v_booking.scheduled_at > v_now then
    raise exception 'REQUEST_NOT_DUE_TO_EXPIRE';
  end if;
  perform set_config('college_crew.trusted_booking_operation', 'on', true);
  update public.bookings
  set status = 'expired', expired_at = v_now
  where id = p_booking_id and status = 'requested';
  return p_booking_id;
end;
$$;

create function public.hourly_replacement_candidate_ids(p_booking_id uuid)
returns table (provider_service_id uuid, provider_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
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
  if v_booking.status <> 'requested' or v_booking.scheduled_at <= v_now then
    return;
  end if;
  if v_now < v_booking.response_alert_at then
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
    and (extract(isodow from v_local_start)::integer - 1)
      = any(pp.availability_weekdays)
    and v_local_start::time >= pp.availability_start_local
    and v_local_end::time <= pp.availability_end_local
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
$$;

create function public.replace_hourly_booking_request(
  p_original_booking_id uuid,
  p_provider_service_id uuid,
  p_response_window_hours integer
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_now timestamptz := statement_timestamp();
  v_original public.bookings%rowtype;
  v_offering record;
  v_booking_id uuid;
begin
  select b.* into v_original
  from public.bookings b
  where b.id = p_original_booking_id
    and b.booking_flow = 'hourly_v1'
    and b.customer_id = v_actor
  for update;
  if not found then
    raise exception 'BOOKING_NOT_FOUND';
  end if;
  if v_original.status <> 'requested' then
    raise exception 'REQUEST_NO_LONGER_OPEN:%', v_original.status;
  end if;
  if v_original.scheduled_at <= v_now then
    perform set_config('college_crew.trusted_booking_operation', 'on', true);
    update public.bookings
    set status = 'expired', expired_at = v_now
    where id = p_original_booking_id and status = 'requested';
    raise exception 'REQUEST_EXPIRED';
  end if;
  if v_now < v_original.response_alert_at then
    raise exception 'REPLACEMENT_NOT_AVAILABLE_YET';
  end if;
  if p_response_window_hours not in (1, 3, 5, 12, 24, 48, 72)
    or v_now + make_interval(hours => p_response_window_hours)
      >= v_original.scheduled_at then
    raise exception 'INVALID_RESPONSE_WINDOW';
  end if;

  select * into v_offering
  from private.assert_hourly_offering_slot(
    p_provider_service_id,
    v_original.scheduled_at,
    v_original.estimated_minutes,
    v_now,
    v_original.service_id
  );
  if v_offering.provider_id = v_original.provider_id then
    raise exception 'REPLACEMENT_PROVIDER_REQUIRED';
  end if;
  if private.provider_has_reserved_slot_conflict(
    v_offering.provider_id,
    v_original.scheduled_at,
    v_original.estimated_minutes,
    null
  ) then
    raise exception 'PROVIDER_SLOT_ALREADY_RESERVED';
  end if;

  insert into public.bookings (
    customer_id, provider_id, service_id, status, scheduled_at, address, details,
    price_cents, platform_fee_cents, created_at, booking_flow,
    estimated_minutes, job_zip, hourly_rate_cents_snapshot, platform_fee_bps,
    billing_minimum_minutes, billing_increment_minutes,
    cancellation_notice_hours, pilot_timezone, response_window_hours,
    response_alert_at, replacement_for_booking_id, customer_name_snapshot,
    provider_display_name_snapshot, service_name_snapshot, fee_policy_version,
    cancellation_policy_version, terms_version,
    customer_authorization_version, policy_snapshot,
    customer_authorization_snapshot
  ) values (
    v_original.customer_id,
    v_offering.provider_id,
    v_offering.service_id,
    'requested',
    v_original.scheduled_at,
    v_original.address,
    v_original.details,
    v_offering.hourly_rate_cents,
    round(v_offering.hourly_rate_cents::numeric * 500 / 10000)::integer,
    v_now,
    'hourly_v1',
    v_original.estimated_minutes,
    v_original.job_zip,
    v_offering.hourly_rate_cents,
    500,
    60,
    15,
    12,
    'America/Chicago',
    p_response_window_hours,
    v_now + make_interval(hours => p_response_window_hours),
    v_original.id,
    v_original.customer_name_snapshot,
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
      'pilot_timezone', 'America/Chicago',
      'replacement_for_booking_id', v_original.id
    ),
    jsonb_build_object(
      'version', 'hourly-v1-saved-method',
      'scope', 'booking_only',
      'saved_method_authorization_required_at_payment', true
    )
  ) returning id into v_booking_id;

  perform set_config('college_crew.trusted_booking_operation', 'on', true);
  update public.bookings
  set
    status = 'withdrawn',
    withdrawn_at = v_now,
    withdrawn_by = v_actor,
    withdrawal_reason = 'customer_requested_replacement',
    replaced_by_booking_id = v_booking_id
  where id = p_original_booking_id and status = 'requested';
  if not found then
    raise exception 'REQUEST_NO_LONGER_OPEN';
  end if;

  return v_booking_id;
end;
$$;

create function public.rank_hourly_provider_ids(
  p_job_zip text,
  p_service_slug text default null
)
returns table (provider_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select pp.id
  from public.provider_profiles pp
  join public.provider_services ps on ps.provider_id = pp.id
  join public.services s on s.id = ps.service_id
  left join public.provider_ratings pr on pr.provider_id = pp.id
  where pp.verification_status = 'approved'
    and pp.stripe_account_id is not null
    and pp.stripe_transfers_active
    and pp.stripe_transfers_checked_at is not null
    and pp.service_zip is not null
    and cardinality(pp.availability_weekdays) > 0
    and pp.availability_start_local is not null
    and pp.availability_end_local is not null
    and ps.hourly_rate_cents between 2000 and 15000
    and s.is_live
    and (p_service_slug is null or s.slug = p_service_slug)
  group by pp.id, pp.service_zip, pp.display_name, pr.avg_rating
  order by
    (pp.service_zip = p_job_zip) desc,
    coalesce(pr.avg_rating, 0) desc,
    min(ps.hourly_rate_cents),
    lower(pp.display_name),
    pp.id;
$$;

-- Close the old direct-write surface. All booking writes now pass through an
-- authenticated, validating RPC or a server-only service-role operation.
drop policy if exists "Customers create booking requests" on public.bookings;
drop policy if exists "Participants drive the booking state machine" on public.bookings;
revoke insert, update, delete, truncate, references, trigger
  on table public.bookings from anon, authenticated;
grant select on table public.bookings to authenticated;

revoke all on function public.create_hourly_booking_request(
  uuid, timestamptz, integer, integer, text, text, text
) from public, anon, authenticated;
grant execute on function public.create_hourly_booking_request(
  uuid, timestamptz, integer, integer, text, text, text
) to authenticated;

revoke all on function public.accept_booking_request(uuid)
  from public, anon, authenticated;
grant execute on function public.accept_booking_request(uuid) to authenticated;

revoke all on function public.decline_booking_request(uuid)
  from public, anon, authenticated;
grant execute on function public.decline_booking_request(uuid) to authenticated;

revoke all on function public.cancel_booking_request(uuid)
  from public, anon, authenticated;
grant execute on function public.cancel_booking_request(uuid) to authenticated;

revoke all on function public.transition_legacy_booking(uuid, public.booking_status)
  from public, anon, authenticated;
grant execute on function public.transition_legacy_booking(uuid, public.booking_status)
  to authenticated;

revoke all on function public.dismiss_booking(uuid)
  from public, anon, authenticated;
grant execute on function public.dismiss_booking(uuid) to authenticated;

revoke all on function public.mark_hourly_response_alert(uuid)
  from public, anon, authenticated;
grant execute on function public.mark_hourly_response_alert(uuid)
  to authenticated, service_role;

revoke all on function public.expire_hourly_booking_request(uuid)
  from public, anon, authenticated;
grant execute on function public.expire_hourly_booking_request(uuid)
  to authenticated, service_role;

revoke all on function public.hourly_replacement_candidate_ids(uuid)
  from public, anon, authenticated;
grant execute on function public.hourly_replacement_candidate_ids(uuid)
  to authenticated;

revoke all on function public.replace_hourly_booking_request(uuid, uuid, integer)
  from public, anon, authenticated;
grant execute on function public.replace_hourly_booking_request(uuid, uuid, integer)
  to authenticated;

revoke all on function public.rank_hourly_provider_ids(text, text)
  from public, anon, authenticated;
grant execute on function public.rank_hourly_provider_ids(text, text)
  to service_role;

comment on function public.create_hourly_booking_request(
  uuid, timestamptz, integer, integer, text, text, text
) is 'Trusted hourly request creation. Derives provider, pricing, policy, and deadlines server-side.';
comment on function public.replace_hourly_booking_request(uuid, uuid, integer)
  is 'Atomically withdraws one open request and creates its validated replacement.';
comment on function public.rank_hourly_provider_ids(text, text)
  is 'Server-only location rank. Returns IDs only and never exposes provider service ZIPs.';
