begin;

set local lock_timeout = '10s';
set local statement_timeout = '2min';

alter table public.provider_profiles
  add column onboarding_submitted_at timestamptz;

comment on column public.provider_profiles.onboarding_submitted_at is
  'When College Crew onboarding was submitted for founder review. Stripe onboarding may start after this point, independently of founder approval.';

-- Before this column existed, submitForReview recorded the provider-terms
-- acceptance as its final durable write. Preserve those completed submissions
-- so existing providers resume at Stripe or their dashboard, not the wizard.
update public.provider_profiles as pp
set onboarding_submitted_at = submissions.accepted_at
from (
  select user_id, min(accepted_at) as accepted_at
  from public.legal_acceptances
  where kind = 'provider_terms'
  group by user_id
) as submissions
where submissions.user_id = pp.user_id;

commit;
