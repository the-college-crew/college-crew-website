-- Provider profile banner: one wide banner shown on Browse cards and the public
-- profile. Either an uploaded photo (banner_image_path) or one of three built-in
-- CSS themes (banner_style) shown until/unless a photo is uploaded. Distinct from
-- the round headshot (avatar_image_path) which overlaps this banner. Replaces the
-- former up-to-three service-icon banner (per-service preview photos retired).

alter table public.provider_profiles
  add column banner_image_path text,
  add column banner_style text not null default 'forest'
    check (banner_style in ('varsity', 'pennant', 'forest'));

comment on column public.provider_profiles.banner_image_path is
  'Optional public banner photo object path in the provider-banners bucket. When null, banner_style selects a built-in CSS theme.';
comment on column public.provider_profiles.banner_style is
  'Built-in banner theme shown when banner_image_path is null: varsity | pennant | forest.';

-- Both are provider-writable from their own client (no free-text moderation
-- risk), like avatar_image_path.
grant update (banner_image_path, banner_style)
  on table public.provider_profiles to authenticated;

-- Public banner bucket. Same 5 MB / browser-image constraints as avatars.
-- Path convention: <provider_user_id>/<random-file-name>.
insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'provider-banners',
  'provider-banners',
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
-- the signed-in provider. Read access comes from the intentionally public bucket.
create policy "Providers upload their own banner"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'provider-banners'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "Providers replace their own banner"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'provider-banners'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'provider-banners'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "Providers remove their own banner"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'provider-banners'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- Expose banner fields on the public directory. Banner is OPTIONAL — it is NOT
-- part of the visibility gate (avatar_image_path still gates below). Appended at
-- the END: CREATE OR REPLACE VIEW can only append output columns, not reorder.
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
    pp.banner_style
  from public.provider_profiles pp
  where public.is_provider_approved(pp.id)
    and pp.avatar_image_path is not null;
