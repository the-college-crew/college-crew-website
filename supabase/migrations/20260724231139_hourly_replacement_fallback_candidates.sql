-- Tier-3 replacement fallback: never show an empty list while someone else offers the service.
create or replace function public.hourly_replacement_fallback_ids(p_booking_id uuid)
 returns table(provider_service_id uuid, provider_id uuid, payout_ready boolean)
 language plpgsql security definer set search_path to ''
as $function$
declare
  v_actor uuid := (select auth.uid());
  v_now timestamptz := statement_timestamp();
  v_booking public.bookings%rowtype;
  c_max_rows constant integer := 10;
begin
  select b.* into v_booking from public.bookings b
  where b.id = p_booking_id and b.booking_flow = 'hourly_v1' and b.customer_id = v_actor;
  if not found then raise exception 'BOOKING_NOT_FOUND'; end if;
  if v_booking.status not in ('requested', 'declined', 'cancelled') or v_booking.scheduled_at <= v_now then return; end if;
  if v_booking.status = 'cancelled' and v_booking.cancelled_by_role is distinct from 'provider' then return; end if;
  if v_booking.status = 'requested' and v_now < v_booking.response_alert_at then raise exception 'REPLACEMENT_NOT_AVAILABLE_YET'; end if;
  return query
  select ps.id, pp.id,
    (pp.stripe_account_id is not null and pp.stripe_transfers_active and pp.stripe_transfers_checked_at is not null) as payout_ready
  from public.provider_services ps
  join public.provider_profiles pp on pp.id = ps.provider_id
  join public.services s on s.id = ps.service_id
  left join public.provider_ratings pr on pr.provider_id = pp.id
  where ps.service_id = v_booking.service_id and pp.id <> v_booking.provider_id
    and pp.verification_status = 'approved' and pp.avatar_image_path is not null
    and ps.hourly_rate_cents between 2000 and 15000 and s.is_live
  order by (pp.stripe_account_id is not null and pp.stripe_transfers_active and pp.stripe_transfers_checked_at is not null) desc,
    (pp.service_zip is not distinct from v_booking.job_zip) desc, coalesce(pr.avg_rating, 0) desc,
    ps.hourly_rate_cents, lower(pp.display_name), pp.id
  limit c_max_rows;
end;
$function$;

revoke all on function public.hourly_replacement_fallback_ids(uuid) from public, anon;
grant execute on function public.hourly_replacement_fallback_ids(uuid) to authenticated;

comment on function public.hourly_replacement_fallback_ids(uuid) is
  'Tier-3 replacement fallback: approved students who offer the same live service, ignoring availability, notice, slot conflicts and payout-readiness. Used only to top a shortlist up to three when tiers 1 and 2 fall short. Not bookable slots — payout_ready tells the caller where to send the customer.';
