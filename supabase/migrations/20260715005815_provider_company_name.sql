-- Optional company name for student-run businesses (SPEC §1 — e.g. a window-
-- washing company). Distinct from display_name: display_name defaults to the
-- provider's legal full name at onboarding and is required; company_name is
-- genuinely optional (nullable, no default) and, when set, is what customers
-- see instead of the legal name on Browse/profile.
--
-- Same risk profile as display_name/bio (impersonation, slander, off-platform
-- contact info), so it gets the same treatment: readable/insertable by the
-- client, but NOT client-updatable — edits must go through the screened
-- Server Action (updateProviderProfile), matching the moderation bypass fix
-- in 20260713165821_profile_text_moderation.sql.

alter table public.provider_profiles
  add column company_name text;

comment on column public.provider_profiles.company_name is
  'Optional student-business name shown instead of display_name when set. Nullable — most providers are individuals.';

grant select (company_name)
  on table public.provider_profiles to anon, authenticated;
grant insert (company_name)
  on table public.provider_profiles to authenticated;

-- Expose it through the sanitized public directory alongside display_name/bio.
-- company_name is appended at the END of the column list: CREATE OR REPLACE
-- VIEW can only append new output columns, not insert/reorder existing ones.
create or replace view public.public_provider_directory
with (security_invoker = true) as
  select
    pp.id as provider_id,
    pp.display_name,
    pp.bio,
    pp.provider_type,
    pp.neighborhood,
    pp.availability,
    pp.availability_weekdays,
    pp.availability_start_local,
    pp.availability_end_local,
    pp.availability_note,
    pp.created_at,
    pp.minimum_notice_hours,
    pp.company_name
  from public.provider_profiles pp
  where public.is_provider_approved(pp.id);

-- Company name goes through the same flag-only moderation pipeline as
-- display_name/bio, so the flag log needs to accept it too.
alter table public.profile_moderation_events
  drop constraint profile_moderation_events_field_valid,
  add constraint profile_moderation_events_field_valid check (
    field in ('display_name', 'bio', 'company_name')
  );
