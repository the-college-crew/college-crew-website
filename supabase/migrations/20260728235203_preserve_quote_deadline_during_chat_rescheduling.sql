-- response_alert_at is required by the immutable quote-v2 booking contract.
-- Preserve it as historical policy data; expire_quote_booking_stage already
-- returns early while rescheduling_started_at is set, so it creates no active
-- response deadline during chat scheduling.
create or replace function public.start_quote_chat_rescheduling(
  p_booking_id uuid, p_quote_cents integer, p_estimated_minutes integer
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_booking public.bookings%rowtype; v_actor uuid := (select auth.uid());
begin
  if p_quote_cents not between 2000 and 1000000 then raise exception 'INVALID_FINAL_QUOTE'; end if;
  if p_estimated_minutes not between 60 and 720 or p_estimated_minutes % 15 <> 0 then raise exception 'INVALID_DURATION'; end if;
  select b.* into v_booking from public.bookings b where b.id = p_booking_id
    and b.booking_flow = 'quote_v2' and public.owns_provider_profile(b.provider_id) for update;
  if not found then raise exception 'BOOKING_NOT_FOUND'; end if;
  if v_booking.status <> 'requested' then raise exception 'REQUEST_NO_LONGER_OPEN'; end if;
  if not private.has_current_legal_document(v_actor, 'platform_terms')
    or not private.has_current_legal_document(v_actor, 'provider_terms') then raise exception 'LEGAL_ACCEPTANCE_REQUIRED'; end if;
  if not exists (select 1 from public.provider_services ps where ps.provider_id = v_booking.provider_id
    and ps.service_id = v_booking.service_id and public.is_provider_offering_quote_bookable(ps.id)) then raise exception 'PROVIDER_NO_LONGER_READY'; end if;
  insert into public.booking_quote_chat_reschedules (booking_id, quote_cents, estimated_minutes)
  values (p_booking_id, p_quote_cents, p_estimated_minutes)
  on conflict (booking_id) do update set quote_cents = excluded.quote_cents,
    estimated_minutes = excluded.estimated_minutes, created_at = statement_timestamp();
  update public.bookings set rescheduling_started_at = statement_timestamp()
  where id = p_booking_id;
  return p_booking_id;
end;
$$;
