-- A provider supplies the fixed quote and private duration before moving a
-- quote request into chat scheduling. The final booking is not created until
-- the other participant accepts a concrete start time.
create table public.booking_quote_chat_reschedules (
  booking_id uuid primary key references public.bookings(id) on delete cascade,
  quote_cents integer not null check (quote_cents between 2000 and 1000000),
  estimated_minutes integer not null check (estimated_minutes between 60 and 720 and estimated_minutes % 15 = 0),
  created_at timestamptz not null default now()
);
alter table public.booking_quote_chat_reschedules enable row level security;
create policy "Quote participants read chat reschedule quote"
  on public.booking_quote_chat_reschedules for select to authenticated
  using (exists (select 1 from public.bookings b where b.id = booking_id and
    (b.customer_id = (select auth.uid()) or public.owns_provider_profile(b.provider_id))));
grant select on public.booking_quote_chat_reschedules to authenticated;

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
  update public.bookings set rescheduling_started_at = statement_timestamp(), response_alert_at = null
  where id = p_booking_id;
  return p_booking_id;
end;
$$;

create or replace function public.propose_quote_chat_reschedule(p_booking_id uuid, p_proposed_start_at timestamptz)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := (select auth.uid()); v_booking public.bookings%rowtype;
  v_details public.booking_quote_chat_reschedules%rowtype; v_service uuid; v_proposal uuid; v_now timestamptz := statement_timestamp();
begin
  select * into v_booking from public.bookings where id = p_booking_id for update;
  if not found or v_actor is null or v_booking.booking_flow <> 'quote_v2' or v_booking.status <> 'requested' or v_booking.rescheduling_started_at is null then raise exception 'RESCHEDULING_NOT_AVAILABLE'; end if;
  if v_booking.customer_id <> v_actor and not public.owns_provider_profile(v_booking.provider_id) then raise exception 'BOOKING_NOT_FOUND'; end if;
  select * into v_details from public.booking_quote_chat_reschedules where booking_id = p_booking_id;
  if not found or p_proposed_start_at <= v_now then raise exception 'INVALID_PROPOSED_TIME'; end if;
  select id into v_service from public.provider_services where provider_id = v_booking.provider_id and service_id = v_booking.service_id limit 1;
  if v_service is null then raise exception 'OFFERING_NOT_BOOKABLE'; end if;
  perform private.assert_hourly_offering_slot(v_service, p_proposed_start_at, v_details.estimated_minutes, v_now, v_booking.service_id);
  perform pg_advisory_xact_lock(hashtextextended(v_booking.provider_id::text, 0));
  if private.provider_has_reserved_slot_conflict(v_booking.provider_id, p_proposed_start_at, v_details.estimated_minutes, v_booking.id) then raise exception 'PROVIDER_SLOT_ALREADY_RESERVED'; end if;
  update public.booking_reschedule_proposals set status='superseded', superseded_at=v_now where booking_id=p_booking_id and status='pending';
  insert into public.booking_reschedule_proposals (booking_id, proposer_id, proposed_start_at) values (p_booking_id, v_actor, p_proposed_start_at) returning id into v_proposal;
  return v_proposal;
end;
$$;

create or replace function public.respond_to_quote_chat_reschedule(p_proposal_id uuid, p_accept boolean)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := (select auth.uid()); v_proposal public.booking_reschedule_proposals%rowtype;
  v_booking public.bookings%rowtype; v_details public.booking_quote_chat_reschedules%rowtype;
  v_service uuid; v_now timestamptz := statement_timestamp(); v_due timestamptz; v_deposit integer;
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
  select id into v_service from public.provider_services where provider_id=v_booking.provider_id and service_id=v_booking.service_id limit 1;
  if v_service is null then raise exception 'OFFERING_NOT_BOOKABLE'; end if;
  perform private.assert_hourly_offering_slot(v_service, v_proposal.proposed_start_at, v_details.estimated_minutes, v_now, v_booking.service_id);
  perform pg_advisory_xact_lock(hashtextextended(v_booking.provider_id::text, 0));
  if private.provider_has_reserved_slot_conflict(v_booking.provider_id, v_proposal.proposed_start_at, v_details.estimated_minutes, v_booking.id) then raise exception 'PROVIDER_SLOT_ALREADY_RESERVED'; end if;
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

create or replace function public.expire_quote_booking_stage(p_booking_id uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare v_now timestamptz := statement_timestamp(); v_booking public.bookings%rowtype; v_counter_due timestamptz;
begin
  select b.* into v_booking from public.bookings b where b.id=p_booking_id and b.booking_flow='quote_v2' for update;
  if not found then raise exception 'BOOKING_NOT_FOUND'; end if;
  if v_booking.status='requested' and v_booking.rescheduling_started_at is not null then return 'chat_rescheduling'; end if;
  if v_booking.status='requested' and v_booking.response_alert_at <= v_now then perform set_config('college_crew.trusted_booking_operation','on',true); update public.bookings set status='expired',expired_at=v_now where id=p_booking_id and status='requested'; return 'response_expired'; end if;
  if v_booking.status='countered' then select min(o.expires_at) into v_counter_due from public.booking_quote_counter_options o where o.booking_id=p_booking_id and o.round_number=v_booking.quote_negotiation_round; if v_counter_due is not null and v_counter_due<=v_now then perform set_config('college_crew.trusted_booking_operation','on',true); update public.bookings set status='expired',expired_at=v_now where id=p_booking_id and status='countered'; return 'counter_expired'; end if; end if;
  if v_booking.status='accepted' and v_booking.initial_payment_due_at<=v_now then perform set_config('college_crew.trusted_booking_operation','on',true); update public.bookings set status='expired',expired_at=v_now where id=p_booking_id and status='accepted'; return 'payment_expired'; end if;
  return 'not_due';
end; $$;

revoke all on function public.start_quote_chat_rescheduling(uuid, integer, integer), public.propose_quote_chat_reschedule(uuid, timestamptz), public.respond_to_quote_chat_reschedule(uuid, boolean) from public, anon;
grant execute on function public.start_quote_chat_rescheduling(uuid, integer, integer), public.propose_quote_chat_reschedule(uuid, timestamptz), public.respond_to_quote_chat_reschedule(uuid, boolean) to authenticated;
