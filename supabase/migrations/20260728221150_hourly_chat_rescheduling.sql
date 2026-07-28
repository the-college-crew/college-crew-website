-- Chat-native rescheduling for hourly requests. A provider explicitly opens a
-- no-deadline rescheduling session; either party may then propose a calendar
-- slot. The other party must accept before the original time is replaced.

alter table public.bookings
  add column if not exists rescheduling_started_at timestamptz;

create table public.booking_reschedule_proposals (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  proposer_id uuid not null references public.profiles(id) on delete restrict,
  proposed_start_at timestamptz not null,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  superseded_at timestamptz,
  constraint booking_reschedule_proposals_status_valid
    check (status in ('pending', 'accepted', 'declined', 'superseded')),
  constraint booking_reschedule_proposals_pending_shape
    check ((status = 'pending' and responded_at is null and superseded_at is null)
      or status <> 'pending')
);

create unique index booking_reschedule_proposals_one_pending_idx
  on public.booking_reschedule_proposals (booking_id)
  where status = 'pending';
create index booking_reschedule_proposals_booking_created_idx
  on public.booking_reschedule_proposals (booking_id, created_at desc);

alter table public.booking_reschedule_proposals enable row level security;
revoke all on public.booking_reschedule_proposals from public, anon;
grant select on public.booking_reschedule_proposals to authenticated;
create policy "booking participants read reschedule proposals"
  on public.booking_reschedule_proposals for select to authenticated
  using (exists (
    select 1 from public.bookings b
    where b.id = booking_id
      and (b.customer_id = (select auth.uid())
        or public.owns_provider_profile(b.provider_id))
  ));

alter table public.booking_automation_jobs
  drop constraint if exists booking_automation_jobs_kind_valid;
alter table public.booking_automation_jobs
  add constraint booking_automation_jobs_kind_valid check (
    kind in (
      'response_alert', 'request_expiration', 'payment_expiration',
      'invoice_autocharge', 'completion_timeout', 'provider_payout',
      'capture_upfront', 'capture_expiration', 'quote_response_expiration',
      'quote_payment_expiration', 'reschedule_provider_reminder'
    )
  );

create or replace function public.start_hourly_chat_rescheduling(p_booking_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_booking public.bookings%rowtype;
begin
  select b.* into v_booking
  from public.bookings b join public.provider_profiles pp on pp.id = b.provider_id
  where b.id = p_booking_id and pp.user_id = (select auth.uid()) for update of b;
  if not found then raise exception 'BOOKING_NOT_FOUND'; end if;
  if v_booking.booking_flow <> 'hourly_v1' or v_booking.status <> 'requested'
    or v_booking.time_flexibility <> 'flexible' then
    raise exception 'RESCHEDULING_NOT_AVAILABLE';
  end if;
  update public.bookings set rescheduling_started_at = coalesce(rescheduling_started_at, statement_timestamp())
  where id = p_booking_id;
  return p_booking_id;
end;
$$;

create or replace function public.propose_hourly_chat_reschedule(
  p_booking_id uuid, p_proposed_start_at timestamptz
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := (select auth.uid()); v_booking public.bookings%rowtype;
  v_provider_service_id uuid; v_proposal_id uuid; v_now timestamptz := statement_timestamp();
begin
  select * into v_booking from public.bookings where id = p_booking_id for update;
  if not found or v_actor is null then raise exception 'BOOKING_NOT_FOUND'; end if;
  if v_booking.customer_id <> v_actor and not public.owns_provider_profile(v_booking.provider_id) then
    raise exception 'BOOKING_NOT_FOUND';
  end if;
  if v_booking.booking_flow <> 'hourly_v1' or v_booking.status <> 'requested'
    or v_booking.rescheduling_started_at is null then raise exception 'RESCHEDULING_NOT_AVAILABLE'; end if;
  if p_proposed_start_at is null or p_proposed_start_at <= v_now
    or p_proposed_start_at = v_booking.scheduled_at then raise exception 'INVALID_PROPOSED_TIME'; end if;
  select id into v_provider_service_id from public.provider_services
  where provider_id = v_booking.provider_id and service_id = v_booking.service_id limit 1;
  if v_provider_service_id is null then raise exception 'OFFERING_NOT_BOOKABLE'; end if;
  perform private.assert_hourly_offering_slot(v_provider_service_id, p_proposed_start_at,
    v_booking.estimated_minutes, v_now, v_booking.service_id);
  perform pg_advisory_xact_lock(hashtextextended(v_booking.provider_id::text, 0));
  if private.provider_has_reserved_slot_conflict(v_booking.provider_id, p_proposed_start_at,
    v_booking.estimated_minutes, v_booking.id) then raise exception 'PROVIDER_SLOT_ALREADY_RESERVED'; end if;
  update public.booking_reschedule_proposals set status = 'superseded', superseded_at = v_now
  where booking_id = p_booking_id and status = 'pending';
  insert into public.booking_reschedule_proposals (booking_id, proposer_id, proposed_start_at)
  values (p_booking_id, v_actor, p_proposed_start_at) returning id into v_proposal_id;
  if v_actor = v_booking.customer_id then
    perform private.enqueue_participant_email('reschedule_provider_new_' || v_proposal_id::text,
      p_booking_id, 'provider', 'reschedule_provider_new_suggestion',
      jsonb_build_object('proposal_id', v_proposal_id));
    insert into public.booking_automation_jobs (event_key, kind, booking_id, source_id, run_at, next_attempt_at)
    values ('reschedule_provider_reminder_' || v_proposal_id::text, 'reschedule_provider_reminder',
      p_booking_id, v_proposal_id, v_now + interval '2 hours', v_now + interval '2 hours')
    on conflict (event_key) do nothing;
  end if;
  return v_proposal_id;
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
  update public.bookings set status = 'accepted', accepted_at = v_now,
    scheduled_at = v_proposal.proposed_start_at, rescheduling_started_at = null
  where id = v_booking.id and status = 'requested';
  update public.booking_reschedule_proposals set status = 'accepted', responded_at = v_now where id = p_proposal_id;
  return v_booking.id;
end;
$$;

-- No customer deadline: once chat rescheduling starts, the old hourly alert and
-- original-slot expiration jobs become harmless no-ops. Acceptance is still
-- fully validated at the new time.
create or replace function public.mark_hourly_response_alert(p_booking_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := (select auth.uid()); v_booking public.bookings%rowtype; v_now timestamptz := statement_timestamp();
begin
  select * into v_booking from public.bookings where id = p_booking_id and booking_flow = 'hourly_v1' for update;
  if not found then raise exception 'BOOKING_NOT_FOUND'; end if;
  if v_actor is not null and v_booking.customer_id <> v_actor
    and not public.owns_provider_profile(v_booking.provider_id) and not public.is_admin() then
    raise exception 'BOOKING_NOT_FOUND';
  end if;
  if v_booking.status <> 'requested' or v_booking.rescheduling_started_at is not null then return p_booking_id; end if;
  if v_booking.scheduled_at <= v_now then
    perform set_config('college_crew.trusted_booking_operation', 'on', true);
    update public.bookings set status = 'expired', expired_at = v_now where id = p_booking_id and status = 'requested';
    return p_booking_id;
  end if;
  if v_now < v_booking.response_alert_at then raise exception 'RESPONSE_ALERT_NOT_DUE'; end if;
  update public.bookings set response_alerted_at = coalesce(response_alerted_at, v_now) where id = p_booking_id;
  return p_booking_id;
end;
$$;

create or replace function public.expire_hourly_booking_request(p_booking_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := (select auth.uid()); v_booking public.bookings%rowtype; v_now timestamptz := statement_timestamp();
begin
  select * into v_booking from public.bookings where id = p_booking_id and booking_flow = 'hourly_v1' for update;
  if not found then raise exception 'BOOKING_NOT_FOUND'; end if;
  if v_actor is not null and v_booking.customer_id <> v_actor
    and not public.owns_provider_profile(v_booking.provider_id) and not public.is_admin() then
    raise exception 'BOOKING_NOT_FOUND';
  end if;
  if v_booking.status <> 'requested' or v_booking.rescheduling_started_at is not null then return p_booking_id; end if;
  if coalesce(v_booking.response_alert_at, v_booking.scheduled_at) > v_now then raise exception 'REQUEST_NOT_DUE_TO_EXPIRE'; end if;
  perform set_config('college_crew.trusted_booking_operation', 'on', true);
  update public.bookings set status = 'expired', expired_at = v_now where id = p_booking_id and status = 'requested';
  return p_booking_id;
end;
$$;

create or replace function public.send_hourly_chat_reschedule_provider_reminder(p_proposal_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_proposal public.booking_reschedule_proposals%rowtype; v_booking public.bookings%rowtype;
begin
  select * into v_proposal from public.booking_reschedule_proposals where id = p_proposal_id;
  if not found or v_proposal.status <> 'pending' then return false; end if;
  select * into v_booking from public.bookings where id = v_proposal.booking_id;
  if not found or v_proposal.proposer_id <> v_booking.customer_id then return false; end if;
  perform private.enqueue_participant_email('reschedule_provider_reminder_' || p_proposal_id::text,
    v_booking.id, 'provider', 'reschedule_provider_reminder', jsonb_build_object('proposal_id', p_proposal_id));
  return true;
end;
$$;

revoke all on function public.start_hourly_chat_rescheduling(uuid) from public, anon;
revoke all on function public.propose_hourly_chat_reschedule(uuid, timestamptz) from public, anon;
revoke all on function public.respond_to_hourly_chat_reschedule(uuid, boolean) from public, anon;
grant execute on function public.start_hourly_chat_rescheduling(uuid) to authenticated;
grant execute on function public.propose_hourly_chat_reschedule(uuid, timestamptz) to authenticated;
grant execute on function public.respond_to_hourly_chat_reschedule(uuid, boolean) to authenticated;
revoke all on function public.send_hourly_chat_reschedule_provider_reminder(uuid) from public, anon, authenticated;
grant execute on function public.send_hourly_chat_reschedule_provider_reminder(uuid) to service_role;
