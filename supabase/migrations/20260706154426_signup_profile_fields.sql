-- ---------------------------------------------------------------------------
-- Signup profile fields: date of birth + structured address
--
-- The signup revamp collects more at account creation:
--   * a home address for customers / a business (student) address for providers
--   * a date of birth for providers only (real 18+ gate; the old over18
--     checkbox was validated then discarded and never stored)
--
-- Customers are just profiles with role='customer' and providers also have a
-- profiles row, so both addresses live here on public.profiles — one write
-- path, and it exists at signup (provider_profiles is created later in
-- onboarding). provider_profiles.neighborhood stays as the coarse browse tag.
--
-- These fields flow in through auth signup metadata (raw_user_meta_data) and
-- are persisted by handle_new_user below. Metadata is user-editable, which is
-- fine for these non-authz fields; the 18+ decision is enforced server-side in
-- the signup action, never trusted from metadata.
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column date_of_birth  date,
  add column address_line1  text not null default '',
  add column address_line2  text not null default '',
  add column city           text not null default '',
  add column state          text not null default '',
  add column postal_code    text not null default '';

-- ---------------------------------------------------------------------------
-- Replace handle_new_user() to also persist DOB + address from signup
-- metadata. Preserves the admin-allowlist precedence and the customer|provider
-- role clamp from 20260702130000_admin_allowlist.sql.
--
-- date_of_birth is written only when metadata carries a value (providers);
-- customers send none and it stays NULL. Address defaults to '' when absent.
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  insert into public.profiles (
    id, role, full_name,
    date_of_birth, address_line1, address_line2, city, state, postal_code
  )
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
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    -- Empty string (or absent) -> NULL date; a real value casts to date.
    nullif(new.raw_user_meta_data ->> 'date_of_birth', '')::date,
    coalesce(new.raw_user_meta_data ->> 'address_line1', ''),
    coalesce(new.raw_user_meta_data ->> 'address_line2', ''),
    coalesce(new.raw_user_meta_data ->> 'city', ''),
    coalesce(new.raw_user_meta_data ->> 'state', ''),
    coalesce(new.raw_user_meta_data ->> 'postal_code', '')
  );
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Client write access. profiles previously granted UPDATE only on full_name
-- (see 20260702200000_fix_public_grants.sql). Let users edit their address
-- later from settings, but NOT date_of_birth — that is an age/ID-verified
-- field, changed only via the service role / admin.
-- ---------------------------------------------------------------------------

grant update (address_line1, address_line2, city, state, postal_code)
  on table public.profiles to authenticated;
