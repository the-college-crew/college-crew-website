-- One optional storefront image per provider offering. These are deliberately
-- separate from private identity documents: providers opt into displaying
-- them publicly on Browse and their public profile.
alter table public.provider_services
  add column if not exists preview_image_path text;

-- Standard uploads are most reliable below 6 MB. Limit each public preview
-- to 5 MB and only admit browser-displayable image types.
insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'provider-service-images',
  'provider-service-images',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Public storefront media uses the path convention
-- <provider_user_id>/<provider_service_id>/<random-file-name>. The parent
-- offering proves the signed-in provider owns an upload destination. Keeping
-- the user id first also lets the owner clean up an image after an offering is
-- deleted. Read access comes from the intentionally public bucket; these
-- policies cover every mutation.
create policy "Providers upload their own service preview images"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'provider-service-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (
      select 1
      from public.provider_services ps
      join public.provider_profiles pp on pp.id = ps.provider_id
      where ps.id::text = (storage.foldername(name))[2]
        and pp.user_id = (select auth.uid())
    )
  );

create policy "Providers replace their own service preview images"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'provider-service-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (
      select 1
      from public.provider_services ps
      join public.provider_profiles pp on pp.id = ps.provider_id
      where ps.id::text = (storage.foldername(name))[2]
        and pp.user_id = (select auth.uid())
    )
  )
  with check (
    bucket_id = 'provider-service-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (
      select 1
      from public.provider_services ps
      join public.provider_profiles pp on pp.id = ps.provider_id
      where ps.id::text = (storage.foldername(name))[2]
        and pp.user_id = (select auth.uid())
    )
  );

create policy "Providers remove their own service preview images"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'provider-service-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
