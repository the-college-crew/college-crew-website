-- Instant-book (pay-at-request) — additive schema only. Safe/no behavior change.
-- Applied to the shared project via MCP apply_migration on 2026-07-22.
-- 1) New payment status for an authorized-but-not-captured first-hour hold.
alter type public.booking_payment_status add value if not exists 'authorized';

-- 2) Customer's decline/timeout preference, chosen at booking time.
do $$
begin
  if not exists (select 1 from pg_type where typname = 'booking_decline_preference') then
    create type public.booking_decline_preference as enum ('auto_rematch', 'keep_control');
  end if;
end$$;

alter table public.bookings
  add column if not exists on_decline_preference public.booking_decline_preference
    not null default 'keep_control';

-- 3) Pre-authorization draft: holds validated booking params + the PI between
--    "card authorized" and "booking created". Server-only (RLS on, no public
--    policies; reached solely via SECURITY DEFINER RPCs).
create table if not exists public.booking_drafts (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique,
  customer_id uuid not null references public.profiles(id) on delete cascade,
  provider_service_id uuid not null references public.provider_services(id) on delete cascade,
  scheduled_at timestamptz not null,
  estimated_minutes integer not null,
  details text not null default '',
  address text not null,
  job_zip text not null,
  address_kind text not null default 'home',
  service_city text not null default '',
  latitude double precision,
  longitude double precision,
  on_decline_preference public.booking_decline_preference not null default 'keep_control',
  hourly_rate_cents integer not null,
  stripe_payment_intent_id text not null unique,
  stripe_customer_id text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index if not exists booking_drafts_customer_idx on public.booking_drafts (customer_id);
create index if not exists booking_drafts_expires_idx on public.booking_drafts (expires_at);
alter table public.booking_drafts enable row level security;

-- 4) Pilot: fix minimum booking notice at 12h for everyone (single setting).
--    Keep the column for later per-provider re-enable; backfill + default to 12.
update public.provider_profiles set minimum_notice_hours = 12 where minimum_notice_hours is distinct from 12;
alter table public.provider_profiles alter column minimum_notice_hours set default 12;
