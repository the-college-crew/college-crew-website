alter table public.provider_profiles
  add column verification_bypassed boolean not null default false,
  add column verification_bypassed_at timestamptz,
  add column verification_bypassed_by uuid references public.profiles(id);
