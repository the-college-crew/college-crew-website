-- Look up the signup role for an email so a resent confirmation link can send
-- the user to the right place (providers -> onboarding, customers -> dashboard).
-- Service-role only: exposing role-by-email to anon/authenticated would be an
-- account-enumeration primitive.
create or replace function public.signup_role_for_email(p_email text)
returns text
language sql
security definer
set search_path = ''
stable
as $$
  select p.role::text
  from public.profiles p
  join auth.users u on u.id = p.id
  where lower(u.email) = lower(p_email)
  limit 1;
$$;

revoke all on function public.signup_role_for_email(text) from public;
revoke all on function public.signup_role_for_email(text) from anon;
revoke all on function public.signup_role_for_email(text) from authenticated;
grant execute on function public.signup_role_for_email(text) to service_role;
