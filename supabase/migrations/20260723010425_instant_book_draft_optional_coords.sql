-- Make the nullable coordinate params optional so an omitted lat/long is valid
-- (a booking without geocoded coordinates). Reorder them last for the defaults.
drop function if exists public.create_booking_draft(uuid, uuid, timestamptz, integer, text, text, text, text, text, double precision, double precision, public.booking_decline_preference, integer, text, text);

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

grant execute on function public.create_booking_draft(uuid, uuid, timestamptz, integer, text, text, text, text, text, public.booking_decline_preference, integer, text, text, double precision, double precision) to authenticated;
