-- Mobile talks to Supabase directly under RLS with no service-role client,
-- but provider capability = "does a provider_profiles row exist for me", and
-- provider_profiles.user_id is deliberately not browser-readable (column
-- grants keep only safe public columns). Expose the single boolean the
-- client actually needs instead of widening the column grants.

create or replace function public.is_provider_capable()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.provider_profiles
    where user_id = auth.uid()
  );
$$;

revoke all on function public.is_provider_capable() from public, anon;
grant execute on function public.is_provider_capable() to authenticated;
