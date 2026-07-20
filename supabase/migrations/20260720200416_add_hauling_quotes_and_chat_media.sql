-- Re-enable flat quotes for visual-scope services and generalize private chat
-- attachments.
--
-- Quote bookings deliberately get their own flow. A request starts at $0, the
-- assigned provider sends one final immutable quote, and only that final amount
-- can move the booking to accepted/payment-ready. Existing legacy and hourly
-- bookings retain their current behavior.

-- ---------------------------------------------------------------------------
-- Provider quote price mode
-- ---------------------------------------------------------------------------

alter table public.provider_services
  add column pricing_mode text not null default 'hourly',
  add column average_quote_cents integer,
  add constraint provider_services_pricing_mode_valid
    check (pricing_mode in ('hourly', 'quote')),
  add constraint provider_services_average_quote_valid
    check (
      average_quote_cents is null
      or average_quote_cents between 2000 and 1000000
    );

update public.provider_services
set pricing_mode = 'hourly'
where hourly_rate_cents is not null;

-- Restore any pre-hourly quote rows for supported services without guessing an
-- average.
update public.provider_services ps
set
  pricing_mode = 'quote',
  price_cents = 0,
  price_type = 'quote',
  unit = 'per_job',
  average_quote_cents = null
from public.services s
where s.id = ps.service_id
  and s.slug in ('hauling', 'pressure-washing', 'window-washing')
  and ps.hourly_rate_cents is null
  and ps.price_type = 'quote';

create function private.enforce_provider_service_pricing_mode()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_service_slug text;
begin
  select s.slug into v_service_slug
  from public.services s
  where s.id = new.service_id;

  if v_service_slug is null then
    raise exception 'SERVICE_NOT_FOUND';
  end if;

  if new.pricing_mode = 'quote' then
    if v_service_slug not in (
      'hauling', 'pressure-washing', 'window-washing'
    ) then
      raise exception 'QUOTE_MODE_REQUIRES_SUPPORTED_SERVICE';
    end if;
    if new.hourly_rate_cents is not null
      or new.price_type <> 'quote'
      or new.price_cents <> 0
      or new.unit <> 'per_job' then
      raise exception 'INVALID_QUOTE_OFFERING';
    end if;
  else
    if new.hourly_rate_cents is null
      or new.hourly_rate_cents not between 2000 and 15000
      or new.average_quote_cents is not null then
      raise exception 'INVALID_HOURLY_OFFERING';
    end if;
  end if;

  return new;
end;
$$;

revoke execute on function private.enforce_provider_service_pricing_mode()
  from public, anon, authenticated, service_role;

create trigger provider_services_pricing_mode_contract
  before insert or update of service_id, pricing_mode, average_quote_cents,
    hourly_rate_cents, price_type, price_cents, unit
  on public.provider_services
  for each row execute function private.enforce_provider_service_pricing_mode();

create index provider_services_quote_lookup_idx
  on public.provider_services (service_id, provider_id)
  where pricing_mode = 'quote';

-- provider_services uses an explicit column allowlist. Extend it for the new
-- public pricing fields or PostgREST upserts and the security-invoker public
-- view would fail even when RLS permits the row.
grant select (pricing_mode, average_quote_cents)
  on table public.provider_services to anon, authenticated;
grant insert (pricing_mode, average_quote_cents)
  on table public.provider_services to authenticated;
grant update (pricing_mode, average_quote_cents)
  on table public.provider_services to authenticated;

-- ---------------------------------------------------------------------------
-- Quote booking contract and lifecycle
-- ---------------------------------------------------------------------------

alter type public.booking_flow add value if not exists 'quote_v1';

alter table public.bookings
  add column average_quote_cents_snapshot integer,
  add column quote_sent_at timestamptz,
  add constraint bookings_average_quote_snapshot_valid check (
    average_quote_cents_snapshot is null
    or average_quote_cents_snapshot between 2000 and 1000000
  );

alter table public.bookings
  drop constraint bookings_hourly_contract_complete;

alter table public.bookings
  add constraint bookings_flow_contract_complete check (
    booking_flow = 'legacy'
    or (
      booking_flow = 'hourly_v1'
      and estimated_minutes is not null
      and job_zip is not null
      and hourly_rate_cents_snapshot is not null
      and average_quote_cents_snapshot is null
      and quote_sent_at is null
      and platform_fee_bps = 500
      and billing_minimum_minutes = 60
      and billing_increment_minutes = 15
      and cancellation_notice_hours = 12
      and pilot_timezone = 'America/Chicago'
      and response_window_hours is not null
      and response_alert_at is not null
      and customer_name_snapshot is not null
      and btrim(customer_name_snapshot) <> ''
      and provider_display_name_snapshot is not null
      and btrim(provider_display_name_snapshot) <> ''
      and service_name_snapshot is not null
      and btrim(service_name_snapshot) <> ''
      and fee_policy_version is not null
      and btrim(fee_policy_version) <> ''
      and cancellation_policy_version is not null
      and btrim(cancellation_policy_version) <> ''
      and terms_version is not null
      and btrim(terms_version) <> ''
      and customer_authorization_version is not null
      and btrim(customer_authorization_version) <> ''
      and policy_snapshot is not null
      and customer_authorization_snapshot is not null
    )
    or (
      booking_flow = 'quote_v1'
      and estimated_minutes is not null
      and job_zip is not null
      and hourly_rate_cents_snapshot is null
      and platform_fee_bps = 500
      and billing_minimum_minutes is null
      and billing_increment_minutes is null
      and cancellation_notice_hours is null
      and pilot_timezone = 'America/Chicago'
      and response_window_hours is not null
      and response_alert_at is not null
      and customer_name_snapshot is not null
      and btrim(customer_name_snapshot) <> ''
      and provider_display_name_snapshot is not null
      and btrim(provider_display_name_snapshot) <> ''
      and service_name_snapshot is not null
      and btrim(service_name_snapshot) <> ''
      and fee_policy_version = 'quote-v1-500bps'
      and cancellation_policy_version = 'quote-v1-before-payment'
      and terms_version = 'quote-v1-2026-07-20'
      and customer_authorization_version = 'quote-v1-final-price-at-payment'
      and policy_snapshot is not null
      and customer_authorization_snapshot is not null
    )
  ),
  add constraint bookings_quote_amount_contract check (
    booking_flow <> 'quote_v1'
    or (
      quote_sent_at is null
      and price_cents = 0
      and platform_fee_cents = 0
      and status in ('requested', 'declined', 'withdrawn', 'expired', 'cancelled')
    )
    or (
      quote_sent_at is not null
      and price_cents between 2000 and 1000000
      and platform_fee_cents =
        round(price_cents::numeric * platform_fee_bps / 10000)::integer
      and status in ('accepted', 'paid', 'completed', 'cancelled')
    )
  );

create function private.enforce_quote_booking_immutability()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.average_quote_cents_snapshot is distinct from old.average_quote_cents_snapshot then
    raise exception 'average quote snapshot is immutable';
  end if;

  if old.booking_flow = 'quote_v1' then
    if old.quote_sent_at is not null and (
      new.quote_sent_at is distinct from old.quote_sent_at
      or new.price_cents is distinct from old.price_cents
      or new.platform_fee_cents is distinct from old.platform_fee_cents
    ) then
      raise exception 'final quote is immutable';
    end if;
    if old.status = 'requested' and new.status = 'accepted' and (
      new.quote_sent_at is null or new.price_cents <= 0
    ) then
      raise exception 'FINAL_QUOTE_REQUIRED';
    end if;
  end if;

  return new;
end;
$$;

revoke execute on function private.enforce_quote_booking_immutability()
  from public, anon, authenticated, service_role;

create trigger booking_quote_immutable_contract
  before update on public.bookings
  for each row execute function private.enforce_quote_booking_immutability();

-- Quote bookings use the same simple full-price states as legacy fixed-price
-- bookings. Hourly transitions remain reserved for trusted hourly RPCs.
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

create or replace function public.is_provider_offering_quote_bookable(
  provider_service_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.provider_services ps
    join public.provider_profiles pp on pp.id = ps.provider_id
    join public.services s on s.id = ps.service_id
    where ps.id = provider_service_id
      and ps.pricing_mode = 'quote'
      and ps.hourly_rate_cents is null
      and s.slug in ('hauling', 'pressure-washing', 'window-washing')
      and s.is_live
      and pp.verification_status = 'approved'
      and pp.stripe_account_id is not null
      and pp.stripe_transfers_active
      and pp.stripe_transfers_checked_at is not null
      and pp.service_zip is not null
      and exists (
        select 1 from public.provider_availability_windows w
        where w.provider_id = pp.id
      )
      and private.has_current_legal_document(pp.user_id, 'platform_terms')
      and private.has_current_legal_document(pp.user_id, 'provider_terms')
  );
$$;

revoke all on function public.is_provider_offering_quote_bookable(uuid)
  from public;
grant execute on function public.is_provider_offering_quote_bookable(uuid)
  to anon, authenticated, service_role;

create function public.create_quote_booking_request(
  p_provider_service_id uuid,
  p_scheduled_at timestamptz,
  p_estimated_minutes integer,
  p_response_window_hours integer,
  p_address text,
  p_job_zip text,
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
  v_actor uuid := (select auth.uid());
  v_now timestamptz := statement_timestamp();
  v_customer_name text;
  v_offering record;
  v_local_start timestamp;
  v_local_end timestamp;
  v_booking_id uuid;
begin
  if v_actor is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  if exists (
    select 1 from public.profiles p where p.id = v_actor and p.role = 'admin'
  ) then raise exception 'ADMIN_BOOKING_NOT_ALLOWED'; end if;
  if not exists (
    select 1 from auth.users u
    where u.id = v_actor and u.email_confirmed_at is not null
  ) then raise exception 'EMAIL_CONFIRMATION_REQUIRED'; end if;
  if exists (
    select 1
    from public.provider_services ps
    join public.provider_profiles pp on pp.id = ps.provider_id
    where ps.id = p_provider_service_id and pp.user_id = v_actor
  ) then raise exception 'SELF_BOOKING_NOT_ALLOWED'; end if;
  if not private.has_current_legal_document(v_actor, 'platform_terms')
    or not private.has_current_legal_document(v_actor, 'customer_booking_terms') then
    raise exception 'LEGAL_ACCEPTANCE_REQUIRED';
  end if;
  if not public.is_provider_offering_quote_bookable(p_provider_service_id) then
    raise exception 'OFFERING_NOT_BOOKABLE';
  end if;

  select nullif(btrim(p.full_name), '') into v_customer_name
  from public.profiles p where p.id = v_actor;
  if v_customer_name is null then raise exception 'CUSTOMER_NAME_REQUIRED'; end if;
  if p_estimated_minutes < 60 or p_estimated_minutes > 720
    or p_estimated_minutes % 15 <> 0 then
    raise exception 'INVALID_DURATION';
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

  select
    ps.provider_id,
    ps.service_id,
    ps.average_quote_cents,
    pp.display_name as provider_display_name,
    pp.minimum_notice_hours,
    s.name as service_name
  into v_offering
  from public.provider_services ps
  join public.provider_profiles pp on pp.id = ps.provider_id
  join public.services s on s.id = ps.service_id
  where ps.id = p_provider_service_id
    and public.is_provider_offering_quote_bookable(ps.id);

  if v_offering.provider_id is null then raise exception 'OFFERING_NOT_BOOKABLE'; end if;
  if nullif(btrim(v_offering.provider_display_name), '') is null then
    raise exception 'PROVIDER_NAME_REQUIRED';
  end if;
  if p_scheduled_at < v_now + make_interval(hours => v_offering.minimum_notice_hours) then
    raise exception 'MINIMUM_NOTICE_NOT_MET';
  end if;

  v_local_start := p_scheduled_at at time zone 'America/Chicago';
  v_local_end := (
    p_scheduled_at + make_interval(mins => p_estimated_minutes)
  ) at time zone 'America/Chicago';
  if v_local_start::date <> v_local_end::date or not exists (
    select 1 from public.provider_availability_windows w
    where w.provider_id = v_offering.provider_id
      and w.weekday = extract(isodow from v_local_start)::integer - 1
      and v_local_start::time >= w.start_local
      and v_local_end::time <= w.end_local
  ) then raise exception 'OUTSIDE_PROVIDER_AVAILABILITY'; end if;

  insert into public.bookings (
    customer_id, provider_id, service_id, status, scheduled_at, address,
    details, price_cents, platform_fee_cents, created_at, booking_flow,
    estimated_minutes, job_zip, address_kind, service_city, latitude, longitude,
    hourly_rate_cents_snapshot, average_quote_cents_snapshot,
    platform_fee_bps, billing_minimum_minutes, billing_increment_minutes,
    cancellation_notice_hours, pilot_timezone, response_window_hours,
    response_alert_at, customer_name_snapshot, provider_display_name_snapshot,
    service_name_snapshot, fee_policy_version, cancellation_policy_version,
    terms_version, customer_authorization_version, policy_snapshot,
    customer_authorization_snapshot
  ) values (
    v_actor, v_offering.provider_id, v_offering.service_id, 'requested',
    p_scheduled_at, btrim(p_address), btrim(coalesce(p_details, '')), 0, 0,
    v_now, 'quote_v1', p_estimated_minutes, p_job_zip, p_address_kind,
    btrim(coalesce(p_service_city, '')), p_latitude, p_longitude, null,
    v_offering.average_quote_cents, 500, null, null, null, 'America/Chicago',
    p_response_window_hours,
    v_now + make_interval(hours => p_response_window_hours),
    v_customer_name, v_offering.provider_display_name, v_offering.service_name,
    'quote-v1-500bps', 'quote-v1-before-payment', 'quote-v1-2026-07-20',
    'quote-v1-final-price-at-payment',
    jsonb_build_object(
      'platform_fee_bps', 500,
      'pricing', 'final_flat_quote',
      'media_may_be_required', true,
      'pilot_timezone', 'America/Chicago'
    ),
    jsonb_build_object(
      'version', 'quote-v1-final-price-at-payment',
      'scope', 'booking_only',
      'charged_at_request', false,
      'final_price_authorization_required_at_payment', true
    )
  ) returning id into v_booking_id;

  return v_booking_id;
end;
$$;

revoke all on function public.create_quote_booking_request(
  uuid, timestamptz, integer, integer, text, text, text, text, text,
  double precision, double precision
) from public, anon, authenticated;
grant execute on function public.create_quote_booking_request(
  uuid, timestamptz, integer, integer, text, text, text, text, text,
  double precision, double precision
) to authenticated;

create function public.send_booking_quote(
  p_booking_id uuid,
  p_quote_cents integer
)
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
  if p_quote_cents is null or p_quote_cents not between 2000 and 1000000 then
    raise exception 'INVALID_FINAL_QUOTE';
  end if;

  select b.* into v_booking
  from public.bookings b
  join public.provider_profiles pp on pp.id = b.provider_id
  where b.id = p_booking_id
    and b.booking_flow = 'quote_v1'
    and pp.user_id = v_actor
  for update of b;
  if not found then raise exception 'BOOKING_NOT_FOUND'; end if;
  if v_booking.status <> 'requested' then
    raise exception 'REQUEST_NO_LONGER_OPEN:%', v_booking.status;
  end if;
  if v_booking.scheduled_at <= v_now then raise exception 'REQUEST_EXPIRED'; end if;
  if not private.has_current_legal_document(v_actor, 'platform_terms')
    or not private.has_current_legal_document(v_actor, 'provider_terms') then
    raise exception 'LEGAL_ACCEPTANCE_REQUIRED';
  end if;
  if not exists (
    select 1
    from public.provider_services ps
    where ps.provider_id = v_booking.provider_id
      and ps.service_id = v_booking.service_id
      and public.is_provider_offering_quote_bookable(ps.id)
  ) then raise exception 'PROVIDER_NO_LONGER_READY'; end if;

  perform pg_advisory_xact_lock(hashtextextended(v_booking.provider_id::text, 0));
  if private.provider_has_reserved_slot_conflict(
    v_booking.provider_id,
    v_booking.scheduled_at,
    v_booking.estimated_minutes,
    v_booking.id
  ) then raise exception 'PROVIDER_SLOT_ALREADY_RESERVED'; end if;

  update public.bookings
  set
    price_cents = p_quote_cents,
    platform_fee_cents = round(p_quote_cents::numeric * 500 / 10000)::integer,
    quote_sent_at = v_now,
    status = 'accepted'
  where id = p_booking_id and status = 'requested';
  if not found then raise exception 'REQUEST_NO_LONGER_OPEN'; end if;

  return p_booking_id;
end;
$$;

revoke all on function public.send_booking_quote(uuid, integer)
  from public, anon, authenticated;
grant execute on function public.send_booking_quote(uuid, integer)
  to authenticated;

create or replace function public.transition_legacy_booking(
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
  where b.id = p_booking_id and b.booking_flow in ('legacy', 'quote_v1')
  for update;
  if not found then raise exception 'FULL_PRICE_BOOKING_NOT_FOUND'; end if;

  select exists (
    select 1 from public.provider_profiles pp
    where pp.id = v_booking.provider_id and pp.user_id = v_actor
  ) into v_is_provider;

  if p_target_status = 'paid' then
    if v_booking.customer_id <> v_actor or v_booking.status <> 'accepted' then
      raise exception 'FULL_PRICE_TRANSITION_NOT_ALLOWED';
    end if;
  elsif p_target_status = 'completed' then
    if not v_is_provider or v_booking.status <> 'paid' then
      raise exception 'FULL_PRICE_TRANSITION_NOT_ALLOWED';
    end if;
  else
    raise exception 'FULL_PRICE_TRANSITION_NOT_ALLOWED';
  end if;

  update public.bookings set status = p_target_status
  where id = p_booking_id and status = v_booking.status;
  if not found then raise exception 'FULL_PRICE_BOOKING_STALE'; end if;
  return p_booking_id;
end;
$$;

-- Append quote fields to the existing safe public offering projection. Keep
-- all prior columns in the same order for PostgREST and generated clients.
create or replace view public.public_provider_offerings
with (security_invoker = true) as
  select
    ps.id as provider_service_id,
    ps.provider_id,
    ps.service_id,
    ps.price_cents,
    ps.price_type,
    ps.unit,
    ps.preview_image_path,
    ps.hourly_rate_cents,
    s.name as service_name,
    s.slug as service_slug,
    s.category as service_category,
    s.is_live as service_is_live,
    public.is_provider_offering_hourly_bookable(ps.id) as is_hourly_bookable,
    ps.pricing_mode,
    ps.average_quote_cents,
    public.is_provider_offering_quote_bookable(ps.id) as is_quote_bookable
  from public.provider_services ps
  join public.services s on s.id = ps.service_id
  join public.provider_profiles pp on pp.id = ps.provider_id
  where public.is_provider_approved(pp.id)
    and pp.avatar_image_path is not null
    and s.is_live;

revoke all on table public.public_provider_offerings from public;
grant select on table public.public_provider_offerings to anon, authenticated;

comment on function public.create_quote_booking_request(
  uuid, timestamptz, integer, integer, text, text, text, text, text,
  double precision, double precision
) is 'Creates an unpaid supported-service quote request with immutable provider, policy, and optional average-quote snapshots.';
comment on function public.send_booking_quote(uuid, integer) is
  'Lets the assigned provider send one immutable final flat quote and reserve the requested slot pending full payment.';

-- ---------------------------------------------------------------------------
-- Private chat images and videos
-- ---------------------------------------------------------------------------

alter table public.messages
  add column attachments jsonb not null default '[]'::jsonb,
  add constraint messages_attachments_valid check (
    jsonb_typeof(attachments) = 'array'
    and jsonb_array_length(attachments) <= 4
  );

update public.messages
set attachments = jsonb_build_array(jsonb_build_object(
  'path', image_path,
  'kind', 'image',
  'mimeType', 'image/jpeg',
  'sizeBytes', 0,
  'name', 'Photo'
))
where image_path is not null;

update storage.buckets
set
  file_size_limit = 52428800,
  allowed_mime_types = array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'video/mp4',
    'video/webm',
    'video/quicktime'
  ]::text[]
where id = 'chat-images';

create policy "Conversation members remove failed chat media"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'chat-images'
    and public.is_conversation_member((storage.foldername(name))[1])
  );

comment on column public.messages.attachments is
  'Validated private chat media manifest. Up to four images or one video; legacy image_path remains during compatibility rollout.';
