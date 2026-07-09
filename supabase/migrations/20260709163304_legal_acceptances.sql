-- Persist user acceptance of the master agreement and per-booking risk
-- addendum. User-facing content is versioned in application code and stored
-- here as a hash + snapshot for auditability.

create type public.legal_acceptance_kind as enum
  ('master_agreement', 'booking_addendum');

create table public.legal_acceptances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  booking_id uuid references public.bookings (id) on delete cascade,
  kind public.legal_acceptance_kind not null,
  role public.user_role not null,
  version text not null,
  content_hash text not null,
  signer_name text not null,
  service_slug text,
  service_name text,
  snapshot jsonb not null default '{}'::jsonb,
  ip_address inet,
  user_agent text,
  accepted_at timestamptz not null default now(),
  constraint legal_acceptances_booking_shape check (
    (kind = 'master_agreement' and booking_id is null and service_slug is null and service_name is null)
    or
    (kind = 'booking_addendum' and booking_id is not null and service_slug is not null and service_name is not null)
  ),
  constraint legal_acceptances_content_hash_not_blank check (btrim(content_hash) <> ''),
  constraint legal_acceptances_signer_name_not_blank check (btrim(signer_name) <> ''),
  constraint legal_acceptances_version_not_blank check (btrim(version) <> '')
);

create unique index legal_acceptances_master_once_per_version_idx
  on public.legal_acceptances (user_id, kind, version)
  where kind = 'master_agreement';

create unique index legal_acceptances_booking_once_idx
  on public.legal_acceptances (booking_id, user_id, kind)
  where kind = 'booking_addendum';

create index legal_acceptances_user_id_idx
  on public.legal_acceptances (user_id, accepted_at desc);

create index legal_acceptances_booking_id_idx
  on public.legal_acceptances (booking_id);

alter table public.legal_acceptances enable row level security;

grant select, insert on table public.legal_acceptances to authenticated;

create policy "Users and admins read legal acceptances"
  on public.legal_acceptances for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

create policy "Users accept current master agreement for themselves"
  on public.legal_acceptances for insert to authenticated
  with check (
    kind = 'master_agreement'
    and user_id = auth.uid()
    and booking_id is null
    and exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role = legal_acceptances.role
    )
  );

create policy "Customers accept risk addendum for their own bookings"
  on public.legal_acceptances for insert to authenticated
  with check (
    kind = 'booking_addendum'
    and user_id = auth.uid()
    and role = 'customer'
    and exists (
      select 1
      from public.bookings b
      where b.id = legal_acceptances.booking_id
        and b.customer_id = auth.uid()
        and b.status = 'accepted'
    )
  );
