-- A customer may accept the provider's pending chat-reschedule proposal.
-- This is deliberately narrower than the existing provider acceptance path:
-- the reschedule RPC authenticates the proposal/parties and sets this
-- transaction-local marker immediately before the booking transition.
create or replace function private.enforce_hourly_acceptance_legal_contract()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_provider_user_id uuid;
  v_customer_reschedule_acceptance boolean :=
    coalesce(current_setting('college_crew.customer_reschedule_acceptance', true), '') = 'on';
begin
  if old.booking_flow = 'hourly_v1'
    and old.status = 'requested'
    and new.status = 'accepted'
    and v_actor is not null then
    select pp.user_id into v_provider_user_id
    from public.provider_profiles pp
    where pp.id = new.provider_id;

    if v_actor = v_provider_user_id then
      if not private.has_current_legal_document(v_actor, 'platform_terms')
        or not private.has_current_legal_document(v_actor, 'provider_terms') then
        raise exception 'LEGAL_ACCEPTANCE_REQUIRED';
      end if;
    elsif v_customer_reschedule_acceptance
      and v_actor = old.customer_id
      and private.has_current_legal_document(v_actor, 'platform_terms')
      and private.has_current_legal_document(v_actor, 'customer_booking_terms') then
      -- The customer is accepting a provider's authenticated chat proposal.
      null;
    else
      raise exception 'LEGAL_ACCEPTANCE_REQUIRED';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.respond_to_hourly_chat_reschedule(
  p_proposal_id uuid, p_accept boolean
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := (select auth.uid()); v_proposal public.booking_reschedule_proposals%rowtype;
  v_booking public.bookings%rowtype; v_provider_service_id uuid; v_now timestamptz := statement_timestamp();
begin
  select * into v_proposal from public.booking_reschedule_proposals where id = p_proposal_id for update;
  if not found then raise exception 'PROPOSAL_NOT_FOUND'; end if;
  select * into v_booking from public.bookings where id = v_proposal.booking_id for update;
  if not found or v_actor is null or v_proposal.status <> 'pending' then raise exception 'PROPOSAL_NO_LONGER_OPEN'; end if;
  if v_actor = v_proposal.proposer_id or (v_booking.customer_id <> v_actor
    and not public.owns_provider_profile(v_booking.provider_id)) then raise exception 'PROPOSAL_NOT_ACTIONABLE'; end if;
  if not p_accept then
    update public.booking_reschedule_proposals set status = 'declined', responded_at = v_now where id = p_proposal_id;
    return v_booking.id;
  end if;
  if v_booking.booking_flow <> 'hourly_v1' or v_booking.status <> 'requested'
    or v_booking.rescheduling_started_at is null then raise exception 'RESCHEDULING_NOT_AVAILABLE'; end if;
  select id into v_provider_service_id from public.provider_services
  where provider_id = v_booking.provider_id and service_id = v_booking.service_id limit 1;
  if v_provider_service_id is null then raise exception 'OFFERING_NOT_BOOKABLE'; end if;
  perform private.assert_hourly_offering_slot(v_provider_service_id, v_proposal.proposed_start_at,
    v_booking.estimated_minutes, v_now, v_booking.service_id);
  perform pg_advisory_xact_lock(hashtextextended(v_booking.provider_id::text, 0));
  if private.provider_has_reserved_slot_conflict(v_booking.provider_id, v_proposal.proposed_start_at,
    v_booking.estimated_minutes, v_booking.id) then raise exception 'PROVIDER_SLOT_ALREADY_RESERVED'; end if;
  perform set_config('college_crew.trusted_booking_operation', 'on', true);
  if v_actor = v_booking.customer_id then
    perform set_config('college_crew.customer_reschedule_acceptance', 'on', true);
  end if;
  update public.bookings set status = 'accepted', accepted_at = v_now,
    scheduled_at = v_proposal.proposed_start_at, rescheduling_started_at = null
  where id = v_booking.id and status = 'requested';
  update public.booking_reschedule_proposals set status = 'accepted', responded_at = v_now where id = p_proposal_id;
  return v_booking.id;
end;
$$;
