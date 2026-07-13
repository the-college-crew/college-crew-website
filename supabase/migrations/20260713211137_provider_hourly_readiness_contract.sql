-- Phase 2: expose only the public scheduling fields and a narrow derived
-- readiness fact. Private service ZIPs, Stripe state, account identifiers,
-- verification internals, and document paths remain outside the directory
-- contract.

grant select (minimum_notice_hours)
  on table public.provider_profiles to anon, authenticated;

create function public.is_provider_offering_hourly_bookable(
  provider_service_id uuid
)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.provider_services ps
    join public.provider_profiles pp on pp.id = ps.provider_id
    join public.services s on s.id = ps.service_id
    where ps.id = provider_service_id
      and pp.verification_status = 'approved'
      and pp.stripe_account_id is not null
      and pp.stripe_transfers_active
      and pp.stripe_transfers_checked_at is not null
      and pp.service_zip is not null
      and cardinality(pp.availability_weekdays) > 0
      and pp.availability_start_local is not null
      and pp.availability_end_local is not null
      and ps.hourly_rate_cents between 2000 and 15000
      and s.is_live
  );
$$;

revoke all on function public.is_provider_offering_hourly_bookable(uuid)
  from public, anon, authenticated;
grant execute on function public.is_provider_offering_hourly_bookable(uuid)
  to anon, authenticated, service_role;

comment on function public.is_provider_offering_hourly_bookable(uuid) is
  'Returns only whether one public offering satisfies hourly pilot readiness. Never exposes the private reason or source fields.';

create or replace view public.public_provider_directory
with (security_invoker = true) as
  select
    pp.id as provider_id,
    pp.display_name,
    pp.bio,
    pp.provider_type,
    pp.neighborhood,
    pp.availability,
    pp.availability_weekdays,
    pp.availability_start_local,
    pp.availability_end_local,
    pp.availability_note,
    pp.created_at,
    pp.minimum_notice_hours
  from public.provider_profiles pp
  where public.is_provider_approved(pp.id);

create or replace view public.public_provider_offerings
with (security_invoker = true) as
  select
    ps.id as provider_service_id,
    ps.provider_id,
    ps.service_id,
    ps.price_cents,
    ps.price_type,
    ps.unit,
    ps.preview_image_path,
    ps.hourly_rate_cents,
    s.name as service_name,
    s.slug as service_slug,
    s.category as service_category,
    s.is_live as service_is_live,
    public.is_provider_offering_hourly_bookable(ps.id) as is_hourly_bookable
  from public.provider_services ps
  join public.services s on s.id = ps.service_id
  join public.provider_profiles pp on pp.id = ps.provider_id
  where public.is_provider_approved(pp.id)
    and s.is_live;

revoke all on table public.public_provider_directory,
  public.public_provider_offerings from anon, authenticated;
grant select on table public.public_provider_directory,
  public.public_provider_offerings to anon, authenticated;

comment on view public.public_provider_directory is
  'Sanitized provider directory. Adds public minimum notice while excluding user IDs, private ZIPs, Stripe IDs/state, identity documents, and internal verification fields.';
comment on view public.public_provider_offerings is
  'Sanitized live offering rows with a derived hourly-bookable fact and no private readiness inputs.';
