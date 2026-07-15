-- Required public profile photo (avatar) for every provider. One photo per
-- provider, shared across all their offerings. Distinct from private identity
-- documents (id_document_url) and from per-offering storefront previews
-- (provider_services.preview_image_path): this is the person's public headshot
-- shown on Browse and their public profile.

alter table public.provider_profiles
  add column avatar_image_path text;

comment on column public.provider_profiles.avatar_image_path is
  'Public profile photo object path in the provider-avatars bucket. Required before a provider is shown publicly (gated in public_provider_directory).';

-- Like id_document_url, the provider writes this via their own client after
-- uploading the image; it carries no free-text moderation risk, so it is
-- client-updatable (unlike display_name/bio/company_name).
grant update (avatar_image_path)
  on table public.provider_profiles to authenticated;

-- Public avatar bucket. Same 5 MB / browser-image constraints as the storefront
-- preview bucket. Path convention: <provider_user_id>/<random-file-name>.
insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'provider-avatars',
  'provider-avatars',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- The owner's user id is the first path segment, so every mutation is scoped to
-- the signed-in provider. Read access comes from the intentionally public
-- bucket; these policies cover every mutation.
create policy "Providers upload their own avatar"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'provider-avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "Providers replace their own avatar"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'provider-avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'provider-avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "Providers remove their own avatar"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'provider-avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- Hard visibility gate: a provider is only public once they have a photo, even
-- if admin-approved. is_provider_approved is left unchanged (approval keeps its
-- admin-decision meaning); the requirement lives in the public read models.
-- avatar_image_path is appended at the END of the directory select — CREATE OR
-- REPLACE VIEW can only append output columns, not reorder existing ones.
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
    pp.avatar_image_path
  from public.provider_profiles pp
  where public.is_provider_approved(pp.id)
    and pp.avatar_image_path is not null;

-- Defense in depth: offerings are only public alongside a photo'd provider too.
create or replace view public.public_provider_offerings
with (security_invoker = true) as
  select
    ps.id as provider_service_id,
    ps.provider_id,
    ps.service_id,
    ps.price_cents,
    ps.price_type,
    ps.unit,
    ps.preview_image_path,
    ps.hourly_rate_cents,
    s.name as service_name,
    s.slug as service_slug,
    s.category as service_category,
    s.is_live as service_is_live,
    public.is_provider_offering_hourly_bookable(ps.id) as is_hourly_bookable
  from public.provider_services ps
    join public.services s on s.id = ps.service_id
    join public.provider_profiles pp on pp.id = ps.provider_id
  where public.is_provider_approved(pp.id)
    and pp.avatar_image_path is not null
    and s.is_live;
