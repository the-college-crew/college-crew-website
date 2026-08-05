# Preview Supabase project

**Status:** complete
**Owner:** Zach
**Branch:** infra/preview-supabase-project
**Updated:** 2026-08-05

## Goal

Give Vercel Preview deployments a dedicated hosted Supabase project with no
production users or data. The Preview project should reproduce the application
schema and security configuration, use sandbox integrations, contain durable
and unmistakably synthetic test accounts, and never be reachable through the
Production deployment's credentials.

## Approach

1. Prove the checked-in migration chain can build a clean Postgres 17 project.
   Compare the resulting schema, migration history, RLS posture, explicit Data
   API grants, Storage buckets, and Realtime publications with the intended
   application contract before changing Vercel.
2. Apply the migration chain to the empty `college-crew-preview` project. Keep
   the production project linked until Preview-targeted commands are ready, and
   use explicit project targeting wherever the CLI supports it.
3. Configure Preview Auth URLs and behavior without copying production users.
   Deploy the checked-in Auth templates only if the new Free project supports
   them with its mail configuration.
4. Deploy all checked-in Edge Functions and their JWT verification settings.
   Configure only Preview-safe secrets: Stripe test mode, Preview origins, and
   non-delivering or deliberately sandboxed email/moderation behavior.
5. Add an idempotent, project-ref-guarded fixture command for durable synthetic
   customer and provider accounts. Every visible field and email must be tagged
   as synthetic; the command must refuse Production and unknown projects.
6. Verify representative anonymous, customer, provider, admin, Storage,
   Realtime, and Edge Function paths against Preview. Run database/security
   advisors and confirm no production data or live Stripe identifiers exist.
7. Only after Preview passes, split Vercel's three Supabase variables:
   Production keeps the existing values and Preview receives the new project
   URL, publishable/anon key, and service-role key. Trigger a fresh Preview
   deployment and verify both deployments identify the intended project.
8. Update `docs/SHARED_DB_SAFETY.md` and environment runbooks to describe the
   two-project architecture, schema promotion workflow, fixture rules, and Free
   plan pause behavior. Commit and open a PR; do not self-merge because the diff
   is not confined to the documented self-merge paths.

## Decisions

- The durable baseline is one customer, one pending/inactive provider, and one
  admin. The provider cannot appear publicly until a tester deliberately
  completes approval and Stripe test onboarding.
- Outbound Resend/OpenAI behavior remains disabled until a test needs it.
- Hosted schema promotion remains manual for the initial rollout. Automation is
  a separate follow-up after the workflow has been exercised.

## Notes

- The project was created healthy on 2026-08-05 in the same `us-east-2` region
  as Production, with Data API enabled, automatic table exposure disabled, and
  automatic RLS enabled.
- The repository has 121 imperative migrations and no checked-in seed file.
- `docs/SHARED_DB_SAFETY.md` records historical drift between migration files
  and the running production schema. A clean migration replay and comparison is
  therefore a required gate, not an assumption.
- Supabase's 2026-08-05 extension change ignores explicit extension versions.
  No migration should depend on installing a pinned extension version.
- A clean local reset applied all 121 migrations. It produced 42 public tables,
  5 views, 128 functions, 48 policies, 7 Storage buckets, and 9 Realtime tables,
  with RLS enabled on every public table. The clean project's key directory
  definitions matched Production byte-for-byte by normalized hash.
- The 15-file pgTAP suite retained its documented clean-database baseline: 8
  files passed and 7 existing files failed. The application unit suite passed
  269/269 tests; lint, typecheck, and the production build passed.
- Preview now has the full migration history, the same schema/security counts,
  all 10 checked-in Edge Functions, Preview Auth redirects, and no copied
  Production users or application data. Default Auth email templates remain
  because custom templates are unavailable with Free default SMTP.
- Vercel now has six distinct Supabase entries: three Production-only and three
  Preview-only. Deployment `dpl_71v9zdYTuXz8579UpUiTo5S8j6Hk` built after the
  split and is Ready as a protected Preview deployment.
- The three durable personas were created and verified. The provider is pending,
  inactive, admin-forced-inactive, and absent from the public directory.
- Production's synthetic-data sweep returned zero users, services, providers,
  and payments. Production was not redeployed or otherwise mutated.
- Vercel's protected-request helper returned no response body under Vercel CLI
  54.21.1 with Node 26, so an authenticated page-body smoke test could not be
  recorded. Deployment metadata, target, build, and variable identities were
  verified independently.
