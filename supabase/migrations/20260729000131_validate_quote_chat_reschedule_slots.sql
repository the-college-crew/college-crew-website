create or replace function private.assert_quote_chat_reschedule_slot(
  p_provider_id uuid, p_service_id uuid, p_scheduled_at timestamptz,
  p_estimated_minutes integer, p_now timestamptz, p_exclude_booking_id uuid
) returns void language plpgsql security definer set search_path = '' as $$
declare v_local_start timestamp; v_local_end timestamp;
begin
  if p_estimated_minutes not between 60 and 720 or p_estimated_minutes % 15 <> 0 then raise exception 'INVALID_DURATION'; end if;
  if not exists (
    select 1 from public.provider_services ps
    where ps.provider_id = p_provider_id and ps.service_id = p_service_id
      and public.is_provider_offering_quote_bookable(ps.id)
  ) then raise exception 'PROVIDER_NO_LONGER_READY'; end if;
  if not private.booking_time_restrictions_disabled()
    and p_scheduled_at < p_now + interval '12 hours' then raise exception 'MINIMUM_NOTICE_NOT_MET'; end if;
  v_local_start := p_scheduled_at at time zone 'America/Chicago';
  v_local_end := v_local_start + make_interval(mins => p_estimated_minutes);
  if v_local_start::date <> v_local_end::date or not exists (
    select 1 from private.provider_effective_window(p_provider_id, v_local_start::date) ew
    where v_local_start::time >= ew.start_local and v_local_end::time <= ew.end_local
  ) then raise exception 'OUTSIDE_PROVIDER_AVAILABILITY'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_provider_id::text, 0));
  if private.provider_has_reserved_slot_conflict(p_provider_id, p_scheduled_at, p_estimated_minutes, p_exclude_booking_id) then
    raise exception 'PROVIDER_SLOT_ALREADY_RESERVED';
  end if;
end;
$$;

create or replace function public.propose_quote_chat_reschedule(p_booking_id uuid, p_proposed_start_at timestamptz)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := (select auth.uid()); v_booking public.bookings%rowtype;
  v_details public.booking_quote_chat_reschedules%rowtype; v_proposal uuid; v_now timestamptz := statement_timestamp();
begin
  select * into v_booking from public.bookings where id = p_booking_id for update;
  if not found or v_actor is null or v_booking.booking_flow <> 'quote_v2' or v_booking.status <> 'requested' or v_booking.rescheduling_started_at is null then raise exception 'RESCHEDULING_NOT_AVAILABLE'; end if;
  if v_booking.customer_id <> v_actor and not public.owns_provider_profile(v_booking.provider_id) then raise exception 'BOOKING_NOT_FOUND'; end if;
  select * into v_details from public.booking_quote_chat_reschedules where booking_id = p_booking_id;
  if not found or p_proposed_start_at <= v_now then raise exception 'INVALID_PROPOSED_TIME'; end if;
  perform private.assert_quote_chat_reschedule_slot(v_booking.provider_id, v_booking.service_id,
    p_proposed_start_at, v_details.estimated_minutes, v_now, v_booking.id);
  update public.booking_reschedule_proposals set status='superseded', superseded_at=v_now where booking_id=p_booking_id and status='pending';
  insert into public.booking_reschedule_proposals (booking_id, proposer_id, proposed_start_at) values (p_booking_id, v_actor, p_proposed_start_at) returning id into v_proposal;
  return v_proposal;
end;
$$;

create or replace function public.respond_to_quote_chat_reschedule(p_proposal_id uuid, p_accept boolean)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := (select auth.uid()); v_proposal public.booking_reschedule_proposals%rowtype;
  v_booking public.bookings%rowtype; v_details public.booking_quote_chat_reschedules%rowtype;
  v_now timestamptz := statement_timestamp(); v_due timestamptz; v_deposit integer;
begin
  select * into v_proposal from public.booking_reschedule_proposals where id=p_proposal_id for update;
  if not found then raise exception 'PROPOSAL_NOT_FOUND'; end if;
  select * into v_booking from public.bookings where id=v_proposal.booking_id for update;
  if not found or v_actor is null or v_proposal.status <> 'pending' then raise exception 'PROPOSAL_NO_LONGER_OPEN'; end if;
  if v_actor = v_proposal.proposer_id or (v_booking.customer_id <> v_actor and not public.owns_provider_profile(v_booking.provider_id)) then raise exception 'PROPOSAL_NOT_ACTIONABLE'; end if;
  if not p_accept then update public.booking_reschedule_proposals set status='declined', responded_at=v_now where id=p_proposal_id; return v_booking.id; end if;
  select * into v_details from public.booking_quote_chat_reschedules where booking_id=v_booking.id;
  if not found or v_booking.booking_flow <> 'quote_v2' or v_booking.status <> 'requested' or v_booking.rescheduling_started_at is null then raise exception 'RESCHEDULING_NOT_AVAILABLE'; end if;
  if v_actor = v_booking.customer_id then
    if not private.has_current_legal_document(v_actor, 'platform_terms') or not private.has_current_legal_document(v_actor, 'customer_booking_terms') then raise exception 'LEGAL_ACCEPTANCE_REQUIRED'; end if;
  elsif not private.has_current_legal_document(v_actor, 'platform_terms') or not private.has_current_legal_document(v_actor, 'provider_terms') then raise exception 'LEGAL_ACCEPTANCE_REQUIRED'; end if;
  perform private.assert_quote_chat_reschedule_slot(v_booking.provider_id, v_booking.service_id,
    v_proposal.proposed_start_at, v_details.estimated_minutes, v_now, v_booking.id);
  v_deposit := ((v_details.quote_cents::bigint * 2000 + 5000) / 10000)::integer;
  v_due := case when private.booking_time_restrictions_disabled() then v_now + interval '24 hours' else least(v_now + interval '24 hours', v_proposal.proposed_start_at - interval '6 hours') end;
  if v_due <= v_now then raise exception 'QUOTE_PAYMENT_WINDOW_UNAVAILABLE'; end if;
  insert into public.booking_quote_provider_estimates (booking_id, estimated_minutes, updated_at) values (v_booking.id, v_details.estimated_minutes, v_now);
  perform set_config('college_crew.trusted_booking_operation', 'on', true);
  update public.bookings set scheduled_at=v_proposal.proposed_start_at, estimated_minutes=null, price_cents=v_details.quote_cents,
    platform_fee_cents=((v_details.quote_cents::bigint * 500 + 5000) / 10000)::integer, upfront_payment_cents=v_deposit,
    quote_sent_at=v_now, accepted_at=v_now, initial_payment_due_at=v_due, status='accepted', rescheduling_started_at=null
    where id=v_booking.id and status='requested';
  update public.booking_reschedule_proposals set status='accepted', responded_at=v_now where id=p_proposal_id;
  perform private.enqueue_booking_automation_job('quote_payment_expiration_' || v_booking.id::text, 'quote_payment_expiration', v_booking.id, v_booking.id, v_due);
  return v_booking.id;
end;
$$;

revoke all on function private.assert_quote_chat_reschedule_slot(uuid, uuid, timestamptz, integer, timestamptz, uuid) from public, anon, authenticated, service_role;
