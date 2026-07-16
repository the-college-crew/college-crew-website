-- Split the legacy role-based Master Agreement into action-scoped documents.
-- Exact legacy acceptances remain valid through the private compatibility
-- registry; no historical acceptance or booking snapshot is rewritten.

alter table public.legal_acceptances
  drop constraint legal_acceptances_booking_shape;

alter table public.legal_acceptances
  add constraint legal_acceptances_booking_shape check (
    (
      kind in (
        'master_agreement', 'platform_terms',
        'customer_booking_terms', 'provider_terms'
      )
      and booking_id is null
      and service_slug is null
      and service_name is null
    )
    or (
      kind = 'booking_addendum'
      and booking_id is not null
      and service_slug is not null
      and service_name is not null
    )
    or (
      kind = 'payment_authorization'
      and booking_id is not null
      and service_slug is null
      and service_name is null
    )
  );

create unique index legal_acceptances_modular_once_per_version_idx
  on public.legal_acceptances (user_id, kind, version)
  where kind in ('platform_terms', 'customer_booking_terms', 'provider_terms');

create unique index legal_acceptances_payment_authorization_once_idx
  on public.legal_acceptances (booking_id, user_id, kind)
  where kind = 'payment_authorization';

create table private.current_legal_document_contract (
  kind public.legal_acceptance_kind primary key,
  version text not null check (btrim(version) <> ''),
  content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$')
);

revoke all on table private.current_legal_document_contract from public;

insert into private.current_legal_document_contract (kind, version, content_hash)
values
  (
    'platform_terms', '2026-07-15',
    '073db4d8ee14222513c69c85e6b7c25005b568232f6d00492e4a0fbdb1c76073'
  ),
  (
    'customer_booking_terms', '2026-07-15',
    '6c1466f50728eb4208fab6b006df9544219ab253b0690170ded587fdf3093e95'
  ),
  (
    'provider_terms', '2026-07-15',
    'f0f882fde99647191d17ee6ffa74a33e636ffe6dc8550b0d63cbb6c055973aad'
  );

comment on table private.current_legal_document_contract is
  'Server-owned exact version/hash registry for each current modular legal document.';

create function private.matches_current_legal_document(
  p_kind public.legal_acceptance_kind,
  p_version text,
  p_content_hash text
)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from private.current_legal_document_contract c
    where c.kind = p_kind
      and c.version = p_version
      and c.content_hash = p_content_hash
  );
$$;

revoke all on function private.matches_current_legal_document(
  public.legal_acceptance_kind, text, text
) from public, anon;
grant execute on function private.matches_current_legal_document(
  public.legal_acceptance_kind, text, text
) to authenticated;

comment on function private.matches_current_legal_document(
  public.legal_acceptance_kind, text, text
) is 'Narrow RLS predicate: checks an offered kind/version/hash without exposing the private registry.';

create function private.has_provider_capability(p_user_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.provider_profiles pp
    where pp.user_id = p_user_id
  );
$$;

revoke all on function private.has_provider_capability(uuid)
  from public, anon;
grant execute on function private.has_provider_capability(uuid)
  to authenticated;

create table private.legal_document_legacy_compatibility (
  required_kind public.legal_acceptance_kind not null,
  required_version text not null,
  accepted_role public.user_role not null,
  accepted_version text not null,
  accepted_content_hash text not null,
  primary key (
    required_kind, required_version, accepted_role,
    accepted_version, accepted_content_hash
  )
);

revoke all on table private.legal_document_legacy_compatibility from public;

insert into private.legal_document_legacy_compatibility (
  required_kind, required_version, accepted_role,
  accepted_version, accepted_content_hash
)
values
  (
    'platform_terms', '2026-07-15', 'customer', '2026-07-15',
    'c23126dcfbd3b87132b66c7786de09a940edac9270bb5c59e423ce52dca43ed1'
  ),
  (
    'customer_booking_terms', '2026-07-15', 'customer', '2026-07-15',
    'c23126dcfbd3b87132b66c7786de09a940edac9270bb5c59e423ce52dca43ed1'
  ),
  (
    'platform_terms', '2026-07-15', 'provider', '2026-07-15',
    'e89347ece1acb4359f73bc6d368bdef77775b7aac84da6e463430f17f7b745ca'
  ),
  (
    'customer_booking_terms', '2026-07-15', 'provider', '2026-07-15',
    'e89347ece1acb4359f73bc6d368bdef77775b7aac84da6e463430f17f7b745ca'
  ),
  (
    'provider_terms', '2026-07-15', 'provider', '2026-07-15',
    'e89347ece1acb4359f73bc6d368bdef77775b7aac84da6e463430f17f7b745ca'
  );

comment on table private.legal_document_legacy_compatibility is
  'Exact legacy Master Agreement acceptances that satisfy a modular document without creating synthetic acceptance rows.';

create function private.has_current_legal_document(
  p_user_id uuid,
  p_kind public.legal_acceptance_kind
)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from private.current_legal_document_contract c
    join public.legal_acceptances la
      on la.user_id = p_user_id
      and la.kind = c.kind
      and la.version = c.version
      and la.content_hash = c.content_hash
    where c.kind = p_kind
  ) or exists (
    select 1
    from private.current_legal_document_contract c
    join private.legal_document_legacy_compatibility compat
      on compat.required_kind = c.kind
      and compat.required_version = c.version
    join public.legal_acceptances la
      on la.user_id = p_user_id
      and la.kind = 'master_agreement'
      and la.role = compat.accepted_role
      and la.version = compat.accepted_version
      and la.content_hash = compat.accepted_content_hash
    where c.kind = p_kind
  );
$$;

revoke all on function private.has_current_legal_document(
  uuid, public.legal_acceptance_kind
) from public, anon, authenticated, service_role;

drop policy if exists "Users insert their own legal acceptances"
  on public.legal_acceptances;

create policy "Users insert their own legal acceptances"
  on public.legal_acceptances for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid()) and p.role <> 'admin'
    )
    and (
      (
        kind in ('platform_terms', 'customer_booking_terms')
        and role = 'customer'
        and booking_id is null
        and private.matches_current_legal_document(
          kind, version, content_hash
        )
      )
      or (
        kind = 'provider_terms'
        and role = 'provider'
        and booking_id is null
        and private.has_provider_capability((select auth.uid()))
        and private.matches_current_legal_document(
          kind, version, content_hash
        )
      )
      or (
        kind = 'booking_addendum'
        and role = 'customer'
        and exists (
          select 1
          from public.bookings b
          where b.id = legal_acceptances.booking_id
            and b.customer_id = (select auth.uid())
            and b.status = 'accepted'
        )
      )
      or (
        kind = 'payment_authorization'
        and role = 'customer'
        and version = 'hourly-v1-saved-method-2026-07-15'
        and snapshot ->> 'kind' = 'payment_authorization'
        and snapshot ->> 'version' = version
        and snapshot ->> 'bookingId' = booking_id::text
        and snapshot ->> 'scope' = 'booking_only'
        and snapshot ->> 'text' =
          'I authorize College Crew to charge the displayed first-hour amount now. I also authorize College Crew and Stripe to save this payment method for this booking only and to charge the remaining approved invoice balance. If I do not confirm or dispute the invoice, College Crew may attempt the remaining balance 24 hours after the provider submits the invoice. The final amount is based on the provider''s hourly rate and submitted billable time, subject to the one-hour minimum, 15-minute billing increments, and the dispute process.'
        and exists (
          select 1
          from public.bookings b
          where b.id = legal_acceptances.booking_id
            and b.customer_id = (select auth.uid())
            and b.booking_flow = 'hourly_v1'
            and b.status = 'accepted'
            and (snapshot -> 'amounts' ->> 'firstHourCents')::integer =
              b.hourly_rate_cents_snapshot
            and (snapshot -> 'amounts' ->> 'estimatedTotalCents')::integer =
              ((b.hourly_rate_cents_snapshot::bigint * b.estimated_minutes + 30) / 60)::integer
            and (snapshot -> 'amounts' ->> 'estimatedBalanceCents')::integer =
              ((b.hourly_rate_cents_snapshot::bigint * b.estimated_minutes + 30) / 60)::integer
              - b.hourly_rate_cents_snapshot
            and (snapshot ->> 'dueAt')::timestamptz = b.initial_payment_due_at
        )
      )
    )
  );

create or replace function private.enforce_hourly_acceptance_legal_contract()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_provider_user_id uuid;
begin
  if old.booking_flow = 'hourly_v1'
    and old.status = 'requested'
    and new.status = 'accepted'
    and v_actor is not null then
    select pp.user_id into v_provider_user_id
    from public.provider_profiles pp
    where pp.id = new.provider_id;

    if v_provider_user_id is distinct from v_actor
      or not private.has_current_legal_document(v_actor, 'platform_terms')
      or not private.has_current_legal_document(v_actor, 'provider_terms') then
      raise exception 'LEGAL_ACCEPTANCE_REQUIRED';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.is_provider_offering_hourly_bookable(
  provider_service_id uuid
)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.provider_services ps
    join public.provider_profiles pp on pp.id = ps.provider_id
    join public.services s on s.id = ps.service_id
    where ps.id = provider_service_id
      and pp.verification_status = 'approved'
      and pp.stripe_account_id is not null
      and pp.stripe_transfers_active
      and pp.stripe_transfers_checked_at is not null
      and pp.service_zip is not null
      and exists (
        select 1 from public.provider_availability_windows w
        where w.provider_id = pp.id
      )
      and ps.hourly_rate_cents between 2000 and 15000
      and s.is_live
      and private.has_current_legal_document(pp.user_id, 'platform_terms')
      and private.has_current_legal_document(pp.user_id, 'provider_terms')
  );
$$;

comment on function public.is_provider_offering_hourly_bookable(uuid) is
  'Returns whether an offering is hourly-ready, including exact platform and provider terms acceptance.';

create or replace function public.create_hourly_booking_request(
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
language plpgsql security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_booking_id uuid;
begin
  if v_actor is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  if exists (
    select 1 from public.profiles p
    where p.id = v_actor and p.role = 'admin'
  ) then raise exception 'ADMIN_BOOKING_NOT_ALLOWED'; end if;
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
  if not public.is_provider_offering_hourly_bookable(p_provider_service_id) then
    raise exception 'OFFERING_NOT_BOOKABLE';
  end if;

  perform set_config('college_crew.hourly_legal_publication', 'on', true);
  v_booking_id := private.create_hourly_booking_request_unchecked(
    p_provider_service_id, p_scheduled_at, p_estimated_minutes,
    p_response_window_hours, p_address, p_job_zip, p_details,
    p_address_kind, p_service_city, p_latitude, p_longitude
  );
  return v_booking_id;
end;
$$;

create or replace function public.replace_hourly_booking_request(
  p_original_booking_id uuid,
  p_provider_service_id uuid,
  p_response_window_hours integer
)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_booking_id uuid;
begin
  if v_actor is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  if exists (
    select 1 from public.profiles p
    where p.id = v_actor and p.role = 'admin'
  ) then raise exception 'ADMIN_BOOKING_NOT_ALLOWED'; end if;
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
  if not public.is_provider_offering_hourly_bookable(p_provider_service_id) then
    raise exception 'OFFERING_NOT_BOOKABLE';
  end if;

  perform set_config('college_crew.hourly_legal_publication', 'on', true);
  v_booking_id := private.replace_hourly_booking_request_unchecked(
    p_original_booking_id, p_provider_service_id, p_response_window_hours
  );
  return v_booking_id;
end;
$$;

create or replace function public.begin_first_hour_payment(
  p_booking_id uuid,
  p_authorization_version text
)
returns table (
  payment_id uuid,
  idempotency_key text,
  amount_cents integer,
  application_fee_cents integer
)
language plpgsql security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_booking public.bookings%rowtype;
begin
  if v_actor is null then raise exception 'AUTH_REQUIRED'; end if;

  select b.* into v_booking
  from public.bookings b
  where b.id = p_booking_id and b.customer_id = v_actor;
  if not found then raise exception 'BOOKING_NOT_FOUND'; end if;
  if p_authorization_version is distinct from
    'hourly-v1-saved-method-2026-07-15'
    and p_authorization_version is distinct from
      v_booking.customer_authorization_version then
    raise exception 'AUTHORIZATION_VERSION_REQUIRED';
  end if;

  -- A pre-migration first-hour payment already carries its immutable booking
  -- authorization. New attempts require the separate exact booking record.
  if not exists (
    select 1 from public.booking_payments bp
    where bp.booking_id = p_booking_id
      and bp.kind = 'first_hour'
      and bp.customer_authorization_version = p_authorization_version
  ) and not exists (
    select 1 from public.legal_acceptances la
    where la.user_id = v_actor
      and la.booking_id = p_booking_id
      and la.kind = 'payment_authorization'
      and la.version = p_authorization_version
      and la.snapshot ->> 'kind' = 'payment_authorization'
      and la.snapshot ->> 'bookingId' = p_booking_id::text
      and la.snapshot ->> 'scope' = 'booking_only'
  ) then
    raise exception 'PAYMENT_AUTHORIZATION_REQUIRED';
  end if;

  return query
  select result.payment_id, result.idempotency_key,
    result.amount_cents, result.application_fee_cents
  from private.begin_first_hour_payment_unchecked(
    p_booking_id, p_authorization_version
  ) as result;
end;
$$;

comment on function public.create_hourly_booking_request(
  uuid, timestamptz, integer, integer, text, text, text, text, text,
  double precision, double precision
) is 'Creates an hourly request after current platform and customer booking terms, preserving exact booking policy snapshots.';
comment on function public.replace_hourly_booking_request(uuid, uuid, integer) is
  'Creates a replacement request after current platform and customer booking terms.';
comment on function public.begin_first_hour_payment(uuid, text) is
  'Begins a first-hour payment after a booking-specific amount and saved-method authorization; existing payment attempts remain resumable.';
