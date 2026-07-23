-- Instant-book: min-notice lockdown + the authorize-first read/draft RPCs.
-- Applied to the shared project via MCP apply_migration on 2026-07-22.

-- Force 12h minimum notice for everyone (pilot: single setting, ignore the param).
create or replace function public.save_provider_availability(p_windows jsonb, p_availability_note text, p_service_zip text, p_minimum_notice_hours integer)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_provider uuid;
  v_count integer;
begin
  select pp.id into v_provider
  from public.provider_profiles pp
  where pp.user_id = (select auth.uid());
  if v_provider is null then
    raise exception 'PROVIDER_PROFILE_NOT_FOUND';
  end if;

  if p_windows is null or jsonb_typeof(p_windows) <> 'array' then
    raise exception 'INVALID_AVAILABILITY_WINDOWS';
  end if;
  v_count := jsonb_array_length(p_windows);
  if v_count < 1 or v_count > 7 then
    raise exception 'INVALID_AVAILABILITY_WINDOWS';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_windows) as w
    where jsonb_typeof(w->'weekday') <> 'number'
      or (w->>'weekday') !~ '^[0-6]$'
      or (w->>'start') is null
      or (w->>'start') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
      or (w->>'end') is null
      or (w->>'end') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
      or (w->>'start')::time >= (w->>'end')::time
  ) then
    raise exception 'INVALID_AVAILABILITY_WINDOWS';
  end if;
  if (
    select count(distinct (w->>'weekday')::smallint)
    from jsonb_array_elements(p_windows) as w
  ) <> v_count then
    raise exception 'INVALID_AVAILABILITY_WINDOWS';
  end if;

  delete from public.provider_availability_windows
  where provider_id = v_provider;

  insert into public.provider_availability_windows
    (provider_id, weekday, start_local, end_local)
  select
    v_provider,
    (w->>'weekday')::smallint,
    (w->>'start')::time,
    (w->>'end')::time
  from jsonb_array_elements(p_windows) as w;

  -- Pilot: minimum notice is fixed at 12h platform-wide; the incoming param is
  -- intentionally ignored so it can't be lowered per-provider.
  update public.provider_profiles
  set
    availability_note = coalesce(p_availability_note, ''),
    service_zip = p_service_zip,
    minimum_notice_hours = 12
  where id = v_provider;
end;
$function$;

-- Shared pre-booking guard (admin/self/legal/bookable) reused by the quote and
-- finalize steps of the authorize-first flow.
create or replace function private.assert_can_book_hourly(p_provider_service_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_actor uuid := (select auth.uid());
begin
  if v_actor is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  if exists (select 1 from public.profiles p where p.id = v_actor and p.role = 'admin') then
    raise exception 'ADMIN_BOOKING_NOT_ALLOWED';
  end if;
  if exists (
    select 1 from public.provider_services ps
    join public.provider_profiles pp on pp.id = ps.provider_id
    where ps.id = p_provider_service_id and pp.user_id = v_actor
  ) then
    raise exception 'SELF_BOOKING_NOT_ALLOWED';
  end if;
  if not private.has_current_legal_document(v_actor, 'platform_terms')
    or not private.has_current_legal_document(v_actor, 'customer_booking_terms') then
    raise exception 'LEGAL_ACCEPTANCE_REQUIRED';
  end if;
  if not public.is_provider_offering_hourly_bookable(p_provider_service_id) then
    raise exception 'OFFERING_NOT_BOOKABLE';
  end if;
end;
$function$;

-- Step A: price + validate a slot WITHOUT creating a booking (read-only).
create or replace function public.quote_hourly_offering_slot(p_provider_service_id uuid, p_scheduled_at timestamptz, p_estimated_minutes integer)
 returns table(provider_id uuid, service_id uuid, hourly_rate_cents integer, provider_display_name text, service_name text)
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  perform private.assert_can_book_hourly(p_provider_service_id);
  return query
  select q.provider_id, q.service_id, q.hourly_rate_cents, q.provider_display_name, q.service_name
  from private.assert_hourly_offering_slot(
    p_provider_service_id, p_scheduled_at, p_estimated_minutes, statement_timestamp(), null
  ) q;
end;
$function$;

-- Step A: stash the validated params + PI until the card hold lands. Nullable
-- coordinates are last (DEFAULT NULL) so an ungeocoded booking is valid.
create or replace function public.create_booking_draft(p_booking_id uuid, p_provider_service_id uuid, p_scheduled_at timestamptz, p_estimated_minutes integer, p_details text, p_address text, p_job_zip text, p_address_kind text, p_service_city text, p_on_decline_preference public.booking_decline_preference, p_hourly_rate_cents integer, p_stripe_payment_intent_id text, p_stripe_customer_id text, p_latitude double precision DEFAULT NULL, p_longitude double precision DEFAULT NULL)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_actor uuid := (select auth.uid());
begin
  if v_actor is null then raise exception 'AUTH_REQUIRED'; end if;
  insert into public.booking_drafts (
    booking_id, customer_id, provider_service_id, scheduled_at, estimated_minutes,
    details, address, job_zip, address_kind, service_city, latitude, longitude,
    on_decline_preference, hourly_rate_cents, stripe_payment_intent_id, stripe_customer_id, expires_at
  ) values (
    p_booking_id, v_actor, p_provider_service_id, p_scheduled_at, p_estimated_minutes,
    coalesce(p_details, ''), p_address, p_job_zip, coalesce(p_address_kind, 'home'),
    coalesce(p_service_city, ''), p_latitude, p_longitude,
    coalesce(p_on_decline_preference, 'keep_control'), p_hourly_rate_cents,
    p_stripe_payment_intent_id, p_stripe_customer_id, statement_timestamp() + interval '1 hour'
  );
end;
$function$;

grant execute on function public.quote_hourly_offering_slot(uuid, timestamptz, integer) to authenticated;
grant execute on function public.create_booking_draft(uuid, uuid, timestamptz, integer, text, text, text, text, text, public.booking_decline_preference, integer, text, text, double precision, double precision) to authenticated;
