-- College Crew — initial schema (pilot v1).
-- Owner: Ari. Apply with `npx supabase db push`.
-- Source of truth for the data model in docs/SPEC.md §5.
--
-- Conventions:
--   * All money is integer cents (Stripe-compatible; avoids float drift).
--   * RLS is enabled on every table. Cross-table checks live in
--     SECURITY DEFINER helper functions to avoid RLS recursion.
--   * Privileged writes (verification, service curation, payment status)
--     happen through the service-role client in server code, never the browser.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type public.user_role as enum ('customer', 'provider', 'admin');
create type public.provider_type as enum ('business', 'individual');
create type public.verification_status as enum ('pending', 'approved', 'rejected');
create type public.background_check_status as enum ('none', 'pending', 'passed');
create type public.price_type as enum ('fixed', 'quote');
create type public.price_unit as enum ('per_job', 'per_hour');
create type public.booking_status as enum
  ('requested', 'accepted', 'paid', 'completed', 'declined', 'cancelled');
create type public.moderation_status as enum ('clean', 'redacted', 'flagged');

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

-- Extends Supabase auth.users; created automatically by trigger on signup.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role public.user_role not null default 'customer',
  full_name text not null default '',
  created_at timestamptz not null default now()
);

-- Admin-curated service catalog. The UI must always read from here.
create table public.services (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  category text not null,
  is_live boolean not null default false
);

create table public.provider_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles (id) on delete cascade,
  display_name text not null default '',
  bio text not null default '',
  provider_type public.provider_type not null default 'individual',
  neighborhood text not null default '',
  verification_status public.verification_status not null default 'pending',
  id_document_url text,
  background_check_status public.background_check_status not null default 'none',
  -- Null until the provider is approved and completes Stripe Express onboarding.
  stripe_account_id text,
  -- Deliberately flexible for the pilot: { "days": ["mon", ...], "note": "..." }.
  availability jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.provider_services (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.provider_profiles (id) on delete cascade,
  service_id uuid not null references public.services (id) on delete cascade,
  price_cents integer not null check (price_cents >= 0),
  price_type public.price_type not null default 'fixed',
  unit public.price_unit not null default 'per_job',
  unique (provider_id, service_id)
);

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles (id) on delete restrict,
  provider_id uuid not null references public.provider_profiles (id) on delete restrict,
  service_id uuid not null references public.services (id) on delete restrict,
  status public.booking_status not null default 'requested',
  scheduled_at timestamptz not null,
  address text not null,
  details text not null default '',
  -- Snapshotted from provider_services at request time; server-set, never client-set.
  price_cents integer not null check (price_cents >= 0),
  -- 15% take, charged to the provider (locked decision, SPEC §3).
  platform_fee_cents integer not null check (platform_fee_cents >= 0),
  stripe_payment_intent_id text,
  created_at timestamptz not null default now()
);

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references public.bookings (id) on delete cascade,
  rating integer not null check (rating between 1 and 5),
  text text not null default '',
  created_at timestamptz not null default now()
);

-- One thread per customer+provider pair; booking_id records the originating
-- booking (pilot decision: chat opens only after a booking request exists).
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles (id) on delete cascade,
  provider_id uuid not null references public.provider_profiles (id) on delete cascade,
  booking_id uuid references public.bookings (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (customer_id, provider_id)
);

-- Written ONLY by the moderate-message Edge Function (service role).
-- No client insert policy exists — that is what makes moderation unbypassable.
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  body text not null default '' check (char_length(body) <= 4000),
  image_path text,
  moderation_status public.moderation_status not null default 'clean',
  created_at timestamptz not null default now()
);

-- Founder-review log: original text + what matched, per SPEC §7 "log everything".
create table public.moderation_events (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages (id) on delete cascade,
  original_body text not null,
  matched_patterns text[] not null default '{}',
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

create index bookings_customer_id_idx on public.bookings (customer_id);
create index bookings_provider_id_idx on public.bookings (provider_id);
create index bookings_status_idx on public.bookings (status);
create index bookings_scheduled_at_idx on public.bookings (scheduled_at);
create index provider_services_provider_id_idx on public.provider_services (provider_id);
create index provider_services_service_id_idx on public.provider_services (service_id);
create index conversations_booking_id_idx on public.conversations (booking_id);
create index messages_conversation_id_created_at_idx
  on public.messages (conversation_id, created_at);
create index moderation_events_message_id_idx on public.moderation_events (message_id);

-- ---------------------------------------------------------------------------
-- Helper functions (SECURITY DEFINER: bypass RLS for policy checks only)
-- ---------------------------------------------------------------------------

create function public.is_admin()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- Does the current user own this provider profile?
create function public.owns_provider_profile(pp_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.provider_profiles
    where id = pp_id and user_id = auth.uid()
  );
$$;

create function public.is_conversation_member(conv_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.conversations c
    left join public.provider_profiles pp on pp.id = c.provider_id
    where c.id = conv_id
      and (c.customer_id = auth.uid() or pp.user_id = auth.uid())
  );
$$;

-- Text overload for storage policies (object paths arrive as text and may be
-- malformed; never throw inside a policy).
create function public.is_conversation_member(conv_id text)
returns boolean
language plpgsql stable security definer
set search_path = ''
as $$
begin
  return public.is_conversation_member(conv_id::uuid);
exception
  when invalid_text_representation then
    return false;
end;
$$;

-- Booking or conversation counterparties may read each other's basic profile
-- (needed so dashboards can show the other party's name).
create function public.shares_thread_with(profile_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.bookings b
    join public.provider_profiles pp on pp.id = b.provider_id
    where (b.customer_id = profile_id and pp.user_id = auth.uid())
       or (b.customer_id = auth.uid() and pp.user_id = profile_id)
  )
  or exists (
    select 1
    from public.conversations c
    join public.provider_profiles pp on pp.id = c.provider_id
    where (c.customer_id = profile_id and pp.user_id = auth.uid())
       or (c.customer_id = auth.uid() and pp.user_id = profile_id)
  );
$$;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

-- Create a profile row on signup. Role comes from signup metadata but is
-- clamped to customer|provider — admin is only ever assigned manually.
create function public.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, role, full_name)
  values (
    new.id,
    case
      when new.raw_user_meta_data ->> 'role' = 'provider' then 'provider'::public.user_role
      else 'customer'::public.user_role
    end,
    coalesce(new.raw_user_meta_data ->> 'full_name', '')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Enforce the booking state machine (SPEC §5) and who may drive each edge:
--   requested -> accepted | declined   (provider)
--   requested -> cancelled             (customer)
--   accepted  -> paid                  (customer / server via Stripe webhook)
--   accepted  -> cancelled             (customer)
--   paid      -> completed             (provider)
-- Server code (service role, auth.uid() is null) may drive any legal edge.
create function public.enforce_booking_transition()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  actor_is_provider boolean;
  actor_is_customer boolean;
begin
  if new.status = old.status then
    return new;
  end if;

  if not (
    (old.status = 'requested' and new.status in ('accepted', 'declined', 'cancelled')) or
    (old.status = 'accepted'  and new.status in ('paid', 'cancelled')) or
    (old.status = 'paid'      and new.status = 'completed')
  ) then
    raise exception 'illegal booking transition: % -> %', old.status, new.status;
  end if;

  -- Service role / server code: legal edges only, no actor restriction.
  if auth.uid() is null then
    return new;
  end if;

  actor_is_provider := exists (
    select 1 from public.provider_profiles
    where id = new.provider_id and user_id = auth.uid()
  );
  actor_is_customer := new.customer_id = auth.uid();

  if new.status in ('accepted', 'declined', 'completed') and not actor_is_provider then
    raise exception 'only the provider can set status %', new.status;
  end if;
  if new.status in ('cancelled', 'paid') and not actor_is_customer then
    raise exception 'only the customer can set status %', new.status;
  end if;

  return new;
end;
$$;

create trigger booking_status_transition
  before update on public.bookings
  for each row execute function public.enforce_booking_transition();

-- ---------------------------------------------------------------------------
-- Column-level grants (defense in depth alongside RLS)
-- ---------------------------------------------------------------------------

-- Clients may only rename themselves; role changes are server/manual only.
revoke update on table public.profiles from anon, authenticated;
grant update (full_name) on table public.profiles to authenticated;

-- Providers edit their own storefront fields; verification, background-check
-- and Stripe columns are written by server code only.
revoke update on table public.provider_profiles from anon, authenticated;
grant update (display_name, bio, provider_type, neighborhood, availability, id_document_url)
  on table public.provider_profiles to authenticated;

-- After creation, clients can only move a booking through the state machine;
-- price, fee and payment columns are immutable from the browser.
revoke update on table public.bookings from anon, authenticated;
grant update (status) on table public.bookings to authenticated;

-- ---------------------------------------------------------------------------
-- Row-Level Security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.services enable row level security;
alter table public.provider_profiles enable row level security;
alter table public.provider_services enable row level security;
alter table public.bookings enable row level security;
alter table public.reviews enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.moderation_events enable row level security;

-- profiles
create policy "Read own profile, counterparties, or admin"
  on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin() or public.shares_thread_with(id));

create policy "Update own profile"
  on public.profiles for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- services: catalog is world-readable (UI filters on is_live; keeping closed
-- services readable means old bookings never lose their service name).
-- All writes go through the service-role client after an admin check.
create policy "Service catalog is readable by everyone"
  on public.services for select to anon, authenticated
  using (true);

-- provider_profiles: hidden from the public until approved (pilot decision).
create policy "Approved providers are public; owners and admins see all"
  on public.provider_profiles for select to anon, authenticated
  using (
    verification_status = 'approved'
    or user_id = auth.uid()
    or public.is_admin()
  );

create policy "Providers create their own provider profile"
  on public.provider_profiles for insert to authenticated
  with check (user_id = auth.uid());

create policy "Providers update their own provider profile"
  on public.provider_profiles for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- provider_services: visible whenever the owning provider profile is visible
-- (the subquery runs under provider_profiles RLS, so approval gating carries over).
create policy "Offered services visible with their provider"
  on public.provider_services for select to anon, authenticated
  using (exists (select 1 from public.provider_profiles pp where pp.id = provider_id));

create policy "Providers manage their own offered services"
  on public.provider_services for insert to authenticated
  with check (public.owns_provider_profile(provider_id));

create policy "Providers update their own offered services"
  on public.provider_services for update to authenticated
  using (public.owns_provider_profile(provider_id))
  with check (public.owns_provider_profile(provider_id));

create policy "Providers remove their own offered services"
  on public.provider_services for delete to authenticated
  using (public.owns_provider_profile(provider_id));

-- bookings
create policy "Participants and admins read bookings"
  on public.bookings for select to authenticated
  using (
    customer_id = auth.uid()
    or public.owns_provider_profile(provider_id)
    or public.is_admin()
  );

create policy "Customers create booking requests"
  on public.bookings for insert to authenticated
  with check (customer_id = auth.uid() and status = 'requested');

create policy "Participants drive the booking state machine"
  on public.bookings for update to authenticated
  using (customer_id = auth.uid() or public.owns_provider_profile(provider_id))
  with check (customer_id = auth.uid() or public.owns_provider_profile(provider_id));

-- reviews: public (they render on public provider profiles).
create policy "Reviews are public"
  on public.reviews for select to anon, authenticated
  using (true);

create policy "Customers review their own completed bookings"
  on public.reviews for insert to authenticated
  with check (exists (
    select 1 from public.bookings b
    where b.id = booking_id
      and b.customer_id = auth.uid()
      and b.status = 'completed'
  ));

-- conversations
create policy "Members and admins read conversations"
  on public.conversations for select to authenticated
  using (
    customer_id = auth.uid()
    or public.owns_provider_profile(provider_id)
    or public.is_admin()
  );

create policy "Members open conversations"
  on public.conversations for insert to authenticated
  with check (
    (customer_id = auth.uid() or public.owns_provider_profile(provider_id))
    and (
      booking_id is null
      or exists (select 1 from public.bookings b where b.id = booking_id)
    )
  );

-- messages: members read; NOBODY inserts from the client — the moderate-message
-- Edge Function (service role) is the only write path, so moderation cannot be
-- bypassed client-side (SPEC §7).
create policy "Conversation members and admins read messages"
  on public.messages for select to authenticated
  using (public.is_conversation_member(conversation_id) or public.is_admin());

-- moderation_events: founders only.
create policy "Admins read moderation events"
  on public.moderation_events for select to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------------
-- Public read models (SECURITY DEFINER views: bypass RLS on purpose, expose
-- only aggregate / non-PII columns so public profiles can show ratings without
-- opening up the bookings table)
-- ---------------------------------------------------------------------------

create view public.provider_ratings
with (security_invoker = off) as
  select
    b.provider_id,
    round(avg(r.rating)::numeric, 2) as avg_rating,
    count(*)::int as review_count
  from public.reviews r
  join public.bookings b on b.id = r.booking_id
  group by b.provider_id;

create view public.provider_reviews
with (security_invoker = off) as
  select
    r.id,
    b.provider_id,
    b.service_id,
    r.rating,
    r.text,
    r.created_at
  from public.reviews r
  join public.bookings b on b.id = r.booking_id;

grant select on public.provider_ratings to anon, authenticated;
grant select on public.provider_reviews to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Storage buckets + policies
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values
  ('id-documents', 'id-documents', false),
  ('chat-images', 'chat-images', false)
on conflict (id) do nothing;

-- ID documents: path convention <user_id>/<filename>. Owner + admin only.
create policy "Providers upload their own ID documents"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'id-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Providers replace their own ID documents"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'id-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Owners and admins read ID documents"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'id-documents'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
  );

-- Chat images: path convention <conversation_id>/<filename>. Members only.
create policy "Conversation members upload chat images"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'chat-images'
    and public.is_conversation_member((storage.foldername(name))[1])
  );

create policy "Conversation members read chat images"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'chat-images'
    and public.is_conversation_member((storage.foldername(name))[1])
  );

-- ---------------------------------------------------------------------------
-- Realtime: stream new messages to conversation members (RLS applies).
-- ---------------------------------------------------------------------------

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.messages;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Seed: curated launch services (admin-toggled from /admin/services after this)
-- ---------------------------------------------------------------------------

insert into public.services (name, slug, category, is_live)
values
  ('Lawn & yard care',          'lawn-yard-care', 'Outdoor',       true),
  ('Dog walking & pet sitting', 'pet-care',       'Pets',          true),
  ('Housekeeping & cleaning',   'cleaning',       'Home',          true),
  ('Tutoring',                  'tutoring',       'Learning',      true),
  ('Hauling & junk removal',    'hauling',        'Heavy lifting', true),
  ('Babysitting',               'babysitting',    'Care',          true);
