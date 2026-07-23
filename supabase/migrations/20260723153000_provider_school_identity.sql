-- Public school identity for student-provider profiles.
--
-- A provider may select a U.S. Department of Education College Scorecard
-- result (school_scorecard_id + the server-normalized school_domain), or type a
-- custom school (both recognition fields null). school_name is required for
-- every new provider profile. Existing profiles keep the empty default so this
-- additive rollout does not abruptly remove already-approved pilot listings;
-- the application prompts them to fill it on their next profile edit.

alter table public.provider_profiles
  add column school_name text not null default '',
  add column school_scorecard_id integer,
  add column school_domain text,
  add column greek_organization text not null default '',
  add constraint provider_profiles_school_name_length check (
    char_length(school_name) <= 160
  ),
  add constraint provider_profiles_school_scorecard_id_valid check (
    school_scorecard_id is null or school_scorecard_id > 0
  ),
  add constraint provider_profiles_school_domain_valid check (
    school_domain is null
    or (
      char_length(school_domain) <= 253
      and school_domain ~
        '^[a-z0-9](?:[a-z0-9-]{0,62}\.)+[a-z]{2,63}$'
    )
  ),
  add constraint provider_profiles_school_domain_is_recognized check (
    school_domain is null or school_scorecard_id is not null
  ),
  add constraint provider_profiles_greek_organization_length check (
    char_length(greek_organization) <= 120
  );

comment on column public.provider_profiles.school_name is
  'Required provider-entered college/university name. Canonical College Scorecard name when school_scorecard_id is set; custom text otherwise.';
comment on column public.provider_profiles.school_scorecard_id is
  'U.S. Department of Education College Scorecard/IPEDS UnitID for a recognized school; null for a custom school.';
comment on column public.provider_profiles.school_domain is
  'Server-normalized official website domain for a recognized school. Drives the optional public school logo; null for custom/unavailable domains.';
comment on column public.provider_profiles.greek_organization is
  'Optional provider-entered Greek-life house or chapter shown with school identity.';

-- These public-display columns are safe on an approved provider. The UnitID is
-- internal recognition metadata and does not need to be exposed by the view.
grant select (school_name, school_domain, greek_organization)
  on table public.provider_profiles to anon, authenticated;

-- Recognition fields deliberately receive no browser INSERT/UPDATE grant.
-- startProviderProfile and updateProviderProfile canonicalize a selected UnitID
-- against College Scorecard and then write with the authorized server client.

-- Keep the direct-Data-API invariant aligned with the application: even if a
-- future migration grants school_name on INSERT, a new provider row cannot be
-- created without a non-blank school. Service-role onboarding writes bypass RLS
-- only after authenticating and validating the same field.
drop policy "Adults create their own provider profile"
  on public.provider_profiles;

create policy "Adults with a school create their own provider profile"
  on public.provider_profiles for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and public.current_user_is_adult()
    and char_length(btrim(school_name)) > 0
  );

-- Append school display fields to the established sanitized directory view.
-- CREATE OR REPLACE VIEW only permits new output columns at the end.
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
    pp.company_name,
    pp.avatar_image_path,
    pp.banner_image_path,
    pp.banner_style,
    (
      select jsonb_agg(
        jsonb_build_object(
          'weekday', w.weekday,
          'start_local', w.start_local,
          'end_local', w.end_local
        )
        order by w.weekday
      )
      from public.provider_availability_windows w
      where w.provider_id = pp.id
    ) as availability_windows,
    pp.avatar_focal_x,
    pp.avatar_focal_y,
    pp.banner_focal_x,
    pp.banner_focal_y,
    pp.school_name,
    pp.school_domain,
    pp.greek_organization
  from public.provider_profiles pp
  where public.is_provider_approved(pp.id)
    and pp.avatar_image_path is not null;

-- School/Greek text uses the same flag-only moderation vocabulary as other
-- public storefront text.
alter table public.profile_moderation_events
  drop constraint profile_moderation_events_field_valid,
  add constraint profile_moderation_events_field_valid check (
    field in (
      'display_name',
      'bio',
      'company_name',
      'school_name',
      'greek_organization'
    )
  );
