-- ---------------------------------------------------------------------------
-- Admin allowlist (grant-only)
--
-- Admin is never self-serve: the signup trigger clamps every new account to
-- customer|provider. This table is the single source of truth for WHO is
-- allowed to hold the admin role. On signup, an email found here is granted
-- 'admin'; everyone else follows the existing customer|provider clamp.
--
-- "Grant-only": presence here decides who BECOMES admin at signup. Removing a
-- row does not auto-revoke an existing admin — flip profiles.role by hand for
-- that (rare, founders only). Writes to this table go through the service-role
-- client only; the browser can never edit it.
-- ---------------------------------------------------------------------------

create table public.admin_allowlist (
  email      text primary key check (email = lower(email)),
  note       text,
  created_at timestamptz not null default now()
);

-- Only admins may read the allowlist; there is no client write path (no
-- insert/update/delete policy), so only the service role can change it.
alter table public.admin_allowlist enable row level security;

create policy "Admins read the allowlist"
  on public.admin_allowlist for select to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------------
-- Wire the allowlist into signup. Replaces the original handle_new_user():
-- an allowlisted email now takes precedence over the customer|provider clamp.
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, role, full_name)
  values (
    new.id,
    case
      when exists (
        select 1 from public.admin_allowlist
        where email = lower(new.email)
      ) then 'admin'::public.user_role
      when new.raw_user_meta_data ->> 'role' = 'provider' then 'provider'::public.user_role
      else 'customer'::public.user_role
    end,
    coalesce(new.raw_user_meta_data ->> 'full_name', '')
  );
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Seed the four founders.
-- ---------------------------------------------------------------------------

insert into public.admin_allowlist (email, note) values
  ('zach@thecollegecrew.com',   'founder'),
  ('ari@thecollegecrew.com',    'founder'),
  ('max@thecollegecrew.com',    'founder'),
  ('gianna@thecollegecrew.com', 'founder')
on conflict (email) do nothing;

-- Backfill: promote any founder who already has an account.
update public.profiles p
set role = 'admin'
from auth.users u
where u.id = p.id
  and lower(u.email) in (select email from public.admin_allowlist)
  and p.role <> 'admin';
