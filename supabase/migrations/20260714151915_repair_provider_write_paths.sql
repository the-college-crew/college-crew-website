-- Repair provider onboarding/settings writes after Phase 1 replaced blanket
-- Data API access with column-level privileges.
--
-- Keep private provider columns private. These changes only restore operations
-- the existing RLS policies already authorize for the owning provider.

-- PostgREST upsert includes every payload column in ON CONFLICT DO UPDATE.
-- The pricing payload necessarily includes the conflict key, so both key
-- columns need UPDATE privilege as well as INSERT privilege. The existing
-- provider_services UPDATE policy still prevents moving an offering to a
-- provider profile the caller does not own and requires a live service.
grant update (provider_id, service_id)
  on table public.provider_services to authenticated;

-- Service-image Storage policies previously joined provider_profiles and read
-- user_id directly. Phase 1 intentionally removed browser SELECT access to
-- that private ownership column, which made the policy itself fail. Reuse the
-- existing SECURITY DEFINER ownership predicate instead; it checks auth.uid()
-- internally and reveals only a boolean.
drop policy if exists "Providers upload their own service preview images"
  on storage.objects;

create policy "Providers upload their own service preview images"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'provider-service-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (
      select 1
      from public.provider_services ps
      where ps.id::text = (storage.foldername(name))[2]
        and public.owns_provider_profile(ps.provider_id)
    )
  );

drop policy if exists "Providers replace their own service preview images"
  on storage.objects;

create policy "Providers replace their own service preview images"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'provider-service-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (
      select 1
      from public.provider_services ps
      where ps.id::text = (storage.foldername(name))[2]
        and public.owns_provider_profile(ps.provider_id)
    )
  )
  with check (
    bucket_id = 'provider-service-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (
      select 1
      from public.provider_services ps
      where ps.id::text = (storage.foldername(name))[2]
        and public.owns_provider_profile(ps.provider_id)
    )
  );
