-- Job-site photos on quote booking requests.
--
-- Quote-priced work (hauling, pressure washing, window washing) can't be priced
-- sight-unseen, so a quote request now carries 1-8 photos of the job site. They
-- render on the provider's dashboard card for that specific job, separate from
-- chat attachments.
--
-- Photos are uploaded browser-direct BEFORE the booking exists (Server Actions
-- can't carry the bytes past Vercel's ~4.5 MB request cap), so the storage path
-- is keyed by the uploading customer, not by booking id: <user_id>/<uuid>.<ext>.

-- ---------------------------------------------------------------------------
-- Column: the validated photo manifest, same shape as messages.attachments.
-- ---------------------------------------------------------------------------

alter table public.bookings
  add column if not exists job_photos jsonb not null default '[]'::jsonb;

comment on column public.bookings.job_photos is
  'Validated job-site photo manifest for quote_v1 requests: 1-8 image entries '
  '{path, kind, mimeType, sizeBytes, name}. Paths live in the job-photos bucket '
  'under the customer''s own uid folder. Immutable after the request is sent.';

-- Containment lookups (`job_photos @> [{"path": ...}]`) drive the storage read
-- policy, which runs once per object per signed-URL request.
create index if not exists bookings_job_photos_gin
  on public.bookings using gin (job_photos jsonb_path_ops);

-- ---------------------------------------------------------------------------
-- Storage bucket + policies
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'job-photos', 'job-photos', false, 10485760,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do update
set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

/**
 * Can the calling provider read this job photo?
 *
 * True when the caller is the provider on a quote booking whose manifest cites
 * this exact object AND that booking is still live. A provider who declines or
 * lets the request expire loses access: they have no ongoing relationship to
 * the job, and these are photos of someone's home.
 *
 * Security definer because the caller can't select the booking rows this needs
 * to check (RLS), and it runs inside a storage.objects policy.
 */
create or replace function public.can_read_job_photo(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.bookings b
    join public.provider_profiles pp on pp.id = b.provider_id
    where pp.user_id = (select auth.uid())
      and b.status not in ('declined', 'withdrawn', 'expired', 'cancelled')
      and b.job_photos @> jsonb_build_array(jsonb_build_object('path', p_name))
  );
$$;

revoke all on function public.can_read_job_photo(text) from public, anon;
grant execute on function public.can_read_job_photo(text) to authenticated, service_role;

drop policy if exists "Customers upload their own job photos" on storage.objects;
drop policy if exists "Customers remove their own job photos" on storage.objects;
drop policy if exists "Admins remove job photos" on storage.objects;
drop policy if exists "Job photo participants read" on storage.objects;

-- Upload: own folder only. The booking doesn't exist yet at this point, so the
-- uid prefix is the only thing that can be checked.
create policy "Customers upload their own job photos"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'job-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- Delete: own folder only, so the booking form can clean up a photo the
-- customer removed before submitting.
create policy "Customers remove their own job photos"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'job-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- Remediation valve: photos are immutable to their owner once the request is
-- sent, which would otherwise leave nobody able to purge an abusive upload.
create policy "Admins remove job photos"
  on storage.objects for delete to authenticated
  using (bucket_id = 'job-photos' and public.is_admin());

create policy "Job photo participants read"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'job-photos'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or public.is_admin()
      or public.can_read_job_photo(name)
    )
  );

-- ---------------------------------------------------------------------------
-- Quote request RPC: now requires a photo manifest.
--
-- Adding a defaulted parameter to the existing 11-arg function would create an
-- ambiguous overload rather than replace it, so the old signature is dropped.
-- The web booking action is the only caller; mobile has no quote flow.
-- ---------------------------------------------------------------------------

drop function if exists public.create_quote_booking_request(
  uuid, timestamptz, integer, integer, text, text, text, text, text,
  double precision, double precision
);

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
  p_longitude double precision default null,
  -- Defaulted so a caller that forgets gets JOB_PHOTOS_REQUIRED (actionable)
  -- instead of "function does not exist" (a 404 the UI can't explain).
  p_job_photos jsonb default '[]'::jsonb
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
  v_photo_count integer;
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

  -- Photo manifest. Every path must sit under the caller's own uid folder,
  -- otherwise a customer could cite an object belonging to someone else and
  -- hand their provider read access to it.
  if p_job_photos is null or jsonb_typeof(p_job_photos) <> 'array' then
    raise exception 'INVALID_JOB_PHOTOS';
  end if;
  v_photo_count := jsonb_array_length(p_job_photos);
  if v_photo_count < 1 then raise exception 'JOB_PHOTOS_REQUIRED'; end if;
  if v_photo_count > 8 then raise exception 'INVALID_JOB_PHOTOS'; end if;
  -- Shape and types first, in their own statement. A missing key makes `->>`
  -- return NULL, and `NULL <> 'image'` is NULL rather than true, so every
  -- comparison is coalesced. The size range is checked separately below
  -- because Postgres may evaluate OR operands in any order: a cast sharing
  -- this block could run on a non-numeric value and throw a cast error
  -- instead of raising INVALID_JOB_PHOTOS.
  if exists (
    select 1
    from jsonb_array_elements(p_job_photos) as photo
    where jsonb_typeof(photo) <> 'object'
      or coalesce(photo->>'kind', '') <> 'image'
      or coalesce(photo->>'mimeType', '')
         not in ('image/jpeg', 'image/png', 'image/webp')
      or coalesce(jsonb_typeof(photo->'sizeBytes'), '') <> 'number'
      or coalesce(jsonb_typeof(photo->'name'), '') <> 'string'
      or char_length(coalesce(photo->>'name', '')) > 200
      or coalesce(photo->>'path', '')
         !~ ('^' || v_actor::text || '/[A-Za-z0-9._-]{1,120}$')
  ) then
    raise exception 'INVALID_JOB_PHOTOS';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_job_photos) as photo
    where (photo->>'sizeBytes')::numeric <= 0
      or (photo->>'sizeBytes')::numeric > 10485760
  ) then
    raise exception 'INVALID_JOB_PHOTOS';
  end if;
  if (
    select count(distinct photo->>'path')
    from jsonb_array_elements(p_job_photos) as photo
  ) <> v_photo_count then
    raise exception 'INVALID_JOB_PHOTOS';
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
    customer_authorization_snapshot, job_photos
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
      'job_photos_required', true,
      'job_photo_count', v_photo_count,
      'pilot_timezone', 'America/Chicago'
    ),
    jsonb_build_object(
      'version', 'quote-v1-final-price-at-payment',
      'scope', 'booking_only',
      'charged_at_request', false,
      'final_price_authorization_required_at_payment', true
    ),
    p_job_photos
  ) returning id into v_booking_id;

  return v_booking_id;
end;
$$;

revoke all on function public.create_quote_booking_request(
  uuid, timestamptz, integer, integer, text, text, text, text, text,
  double precision, double precision, jsonb
) from public, anon, authenticated;
grant execute on function public.create_quote_booking_request(
  uuid, timestamptz, integer, integer, text, text, text, text, text,
  double precision, double precision, jsonb
) to authenticated;

comment on function public.create_quote_booking_request(
  uuid, timestamptz, integer, integer, text, text, text, text, text,
  double precision, double precision, jsonb
) is
  'Create a quote_v1 booking request. Requires 1-8 job-site photos whose storage '
  'paths belong to the calling customer. Photos are immutable once sent.';

-- ---------------------------------------------------------------------------
-- Keep the manifest immutable after the request is sent, so a provider can
-- never quote against a photo set that changed underneath them.
-- ---------------------------------------------------------------------------

create or replace function private.freeze_job_photos()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.job_photos is distinct from old.job_photos then
    raise exception 'JOB_PHOTOS_IMMUTABLE';
  end if;
  return new;
end;
$$;

drop trigger if exists bookings_freeze_job_photos on public.bookings;
create trigger bookings_freeze_job_photos
  before update on public.bookings
  for each row
  execute function private.freeze_job_photos();
