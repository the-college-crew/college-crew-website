-- Close the 18+ bypass on provider_profiles (adversarial review, 2026-07-16).
--
-- The insert policy from the initial schema only checked ownership
-- (user_id = auth.uid()), so any authenticated user could create their own
-- provider_profiles row directly through the Data API — skipping the
-- onboarding action that collects and verifies a date of birth. Providing is
-- an 18+ capability; the database must hold that invariant on its own.
--
-- The app's only client-side insert (startProviderProfile) persists the DOB
-- via the service role BEFORE inserting the row, and provider-intent signups
-- store it from metadata at account creation, so every legitimate path passes
-- this policy. Service-role writes (e2e seeds, server repairs) bypass RLS as
-- before.

-- SECURITY DEFINER like is_admin(): the check must read the caller's own
-- profiles row without depending on profiles' select policies.
create function public.current_user_is_adult()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid())
      and date_of_birth is not null
      and date_of_birth <= (current_date - interval '18 years')
  );
$$;

revoke all on function public.current_user_is_adult() from public, anon;
grant execute on function public.current_user_is_adult() to authenticated;

drop policy "Providers create their own provider profile"
  on public.provider_profiles;

create policy "Adults create their own provider profile"
  on public.provider_profiles for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and public.current_user_is_adult()
  );
