-- Provider school-email (.edu) OTP verification.
--
-- The provider's login email is now their personal email; student status is
-- proven separately by verifying ownership of a school (.edu) address via a
-- 6-digit OTP emailed to it. This is DISTINCT from provider_profiles.
-- verification_status, which stays the founder's manual student-ID review.
--
-- Two tables, split on secrecy:
--   * provider_email_verifications - the in-flight secret (code hash). RLS on,
--     NO policies: only the service-role client may touch it. If the browser
--     could read a row it could self-verify without ever opening the inbox.
--   * provider_school_emails - the durable, verified result (address + when).
--     Owner- and admin-readable so onboarding/admin pages can show status, but
--     NOT public (unlike provider_profiles, which every customer can read) so a
--     provider's .edu never leaks off-platform. Written only by service role.

-- In-flight OTP: one active code per provider.
create table if not exists public.provider_email_verifications (
  user_id    uuid primary key references public.profiles (id) on delete cascade,
  email      text not null,
  code_hash  text not null,
  attempts   integer not null default 0,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

alter table public.provider_email_verifications enable row level security;
-- Intentionally no policies: service-role only (bypasses RLS). The secret code
-- hash must never be selectable by anon/authenticated.

-- Durable verified school email: one row per provider once verified.
create table if not exists public.provider_school_emails (
  user_id     uuid primary key references public.profiles (id) on delete cascade,
  email       text not null,
  verified_at timestamptz not null default now(),
  created_at  timestamptz not null default now()
);

-- One .edu can back only one provider (anti account-sharing).
create unique index if not exists provider_school_emails_email_key
  on public.provider_school_emails (lower(email));

alter table public.provider_school_emails enable row level security;

-- Owner and founders may read verification status; nobody else (keeps the
-- address off public provider profiles). All writes go through service role.
create policy "Owner and admins read their school email"
  on public.provider_school_emails for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- RLS (not grants) is the real guard, but keep grants explicit and tight.
revoke all on public.provider_school_emails from anon;
revoke all on public.provider_email_verifications from anon, authenticated;
grant select on public.provider_school_emails to authenticated;
