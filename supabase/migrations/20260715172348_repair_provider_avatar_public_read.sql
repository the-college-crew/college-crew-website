-- public_provider_directory and public_provider_offerings are security-invoker
-- views. The avatar migration added avatar_image_path to their SELECT/filter
-- expressions, but did not extend the browser roles' safe column grants. That
-- made both public views fail with permission denied even though their own
-- SELECT grants and the provider-profile RLS policy remained correct.
--
-- Avatar object paths are intentionally public (the provider-avatars bucket is
-- public), so expose only this column and retain all existing RLS enforcement.
grant select (avatar_image_path)
  on table public.provider_profiles to anon, authenticated;
