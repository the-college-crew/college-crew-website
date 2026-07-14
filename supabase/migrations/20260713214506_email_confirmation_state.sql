-- Lets the app tell a user "you're already confirmed — just log in" instead of
-- reporting a successful resend that never happened.
--
-- Supabase's auth.resend() is a deliberate no-op on an already-confirmed
-- account: it returns 200 and sends nothing. Without a way to see that state,
-- resendConfirmation reports success, no email ever arrives, and a user whose
-- token was spent by a mail scanner is stuck forever. This is the missing read.
--
-- SECURITY DEFINER because auth.users is not otherwise reachable from the API.
-- It answers a question about an arbitrary email, so it is an account-existence
-- oracle and must stay service-role only — never grant this to anon or
-- authenticated.
create or replace function public.email_is_confirmed(p_email text)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1
    from auth.users
    where lower(email) = lower(p_email)
      and email_confirmed_at is not null
  );
$$;

revoke all on function public.email_is_confirmed(text) from public;
revoke all on function public.email_is_confirmed(text) from anon;
revoke all on function public.email_is_confirmed(text) from authenticated;
grant execute on function public.email_is_confirmed(text) to service_role;

-- Providers whose login email is itself a confirmed .edu have already proven
-- they own a school address; a second OTP asks them to prove the same thing
-- twice. New signups get this from startProviderProfile — this backfills the
-- accounts that predate it.
insert into public.provider_school_emails (user_id, email, verified_at)
select u.id, lower(u.email), now()
from auth.users u
join public.profiles p on p.id = u.id
where p.role = 'provider'
  and u.email_confirmed_at is not null
  and lower(u.email) like '%.edu'
  and not exists (
    select 1 from public.provider_school_emails s where s.user_id = u.id
  )
  and not exists (
    select 1 from public.provider_school_emails s
    where lower(s.email) = lower(u.email)
  )
on conflict do nothing;

-- Clear any in-flight code for a provider who is now verified: a stale pending
-- row parks them on the enter-your-code screen for a code that no longer matters.
delete from public.provider_email_verifications v
where exists (
  select 1 from public.provider_school_emails s where s.user_id = v.user_id
);
