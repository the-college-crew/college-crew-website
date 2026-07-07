-- Hidden services should disappear from public/customer-facing surfaces without
-- deleting existing provider_services rows. If the service is re-enabled, those
-- preserved offerings become visible again.

drop policy if exists "Offered services visible with their provider"
  on public.provider_services;

create policy "Offered services visible with their provider"
  on public.provider_services for select to anon, authenticated
  using (
    exists (
      select 1
      from public.provider_profiles pp
      where pp.id = provider_id
    )
    and (
      exists (
        select 1
        from public.services s
        where s.id = service_id
          and s.is_live
      )
      or public.owns_provider_profile(provider_id)
      or public.is_admin()
    )
  );

drop policy if exists "Providers manage their own offered services"
  on public.provider_services;

create policy "Providers manage their own offered services"
  on public.provider_services for insert to authenticated
  with check (
    public.owns_provider_profile(provider_id)
    and exists (
      select 1
      from public.services s
      where s.id = service_id
        and s.is_live
    )
  );

drop policy if exists "Providers update their own offered services"
  on public.provider_services;

create policy "Providers update their own offered services"
  on public.provider_services for update to authenticated
  using (public.owns_provider_profile(provider_id))
  with check (
    public.owns_provider_profile(provider_id)
    and exists (
      select 1
      from public.services s
      where s.id = service_id
        and s.is_live
    )
  );
