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

delete from public.provider_email_verifications v
where exists (
  select 1 from public.provider_school_emails s where s.user_id = v.user_id
);
