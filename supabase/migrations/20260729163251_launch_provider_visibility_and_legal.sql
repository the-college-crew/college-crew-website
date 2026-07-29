begin;

set local lock_timeout = '10s';
set local statement_timeout = '2min';

-- Public visibility now means both founder-approved and ready to receive real
-- Stripe transfers. Clearing sandbox mappings at cutover therefore removes
-- every provider from Browse without deleting a single profile.
create or replace function public.is_provider_approved(provider_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.provider_profiles
    where id = provider_profile_id
      and verification_status = 'approved'
      and is_active
      and not admin_forced_inactive
      and stripe_account_id is not null
      and stripe_transfers_active
      and stripe_transfers_checked_at is not null
  );
$$;

comment on function public.is_provider_approved(uuid) is
  'True only when a provider is founder-approved, active, and has a checked active Stripe transfer capability. Used as the public-listing and booking gate.';

-- The formation correction is a material platform-terms revision. Existing
-- account-level acceptances remain as immutable evidence but no longer satisfy
-- the current-version gate; users re-accept before their next protected action.
update private.current_legal_document_contract
set version = '2026-07-29',
    content_hash = 'c8d21c1f8d64f46884ba65bce4ecc7808f3c45c4a20d39f06b368d19225f757b'
where kind = 'platform_terms';

commit;
