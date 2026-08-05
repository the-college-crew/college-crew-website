# Provider onboarding Stripe step

Approved 2026-08-04.

## Summary

- Add Stripe as optional step 6 after Review & submit.
- Let submitted providers start or resume Stripe while founder verification is pending or approved.
- Pause Stripe actions for rejected providers until an admin reopens them.
- Keep public visibility and booking gated by both founder approval and active Stripe transfers.

## Implementation

- Persist `provider_profiles.onboarding_submitted_at` and backfill existing submissions from provider-term acceptances.
- Add a smart `/provider/onboarding` entry route that resolves the earliest incomplete College Crew or Stripe step, while leaving direct dashboard access available.
- Make connected-account creation idempotent per provider, attach provider metadata, save the Stripe mapping before issuing a hosted onboarding link, and return to the initiating College Crew surface.
- Update the wizard, dashboard, settings, product documentation, wireframe, provider instructions, and launch runbook for the new order.
- Leave rejected Stripe accounts mapped and safely blocked; do not auto-close them.

## Verification

- Unit-test onboarding resolution, eligibility, Stripe account/link orchestration, and return destinations.
- Run the migration locally, then run test, lint, typecheck, and build.
- Smoke-test after deployment with one real pending provider; do not create synthetic rows in the shared production database.
