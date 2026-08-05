# Hosted Preview environment

College Crew has two hosted Supabase projects:

| Environment | Supabase project | Data | Stripe |
|---|---|---|---|
| Vercel Production | `college-crew` | Real accounts and live data | Live mode |
| Vercel Preview | `college-crew-preview` | Tagged synthetic accounts only | Test mode |
| Local development/E2E | Local Supabase CLI stack | Disposable fixtures | Placeholder/test |

The Preview project was bootstrapped on 2026-08-05 from all 121 checked-in
migrations. Its tables, views, functions, policies, RLS state, Storage buckets,
Realtime publication, service catalog, and key directory definitions were
compared with Production. Production users and application rows were
intentionally **not** copied.

Supabase's GitHub integration is not connected. Vercel already owns deploys,
and database changes stay reviewable as migrations in this repository.

## Vercel boundary

These variables exist as separate, sensitive Vercel entries for Production and
Preview; there are no longer shared Production+Preview entries:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

Never add any Preview Supabase variable to Production or vice versa. A variable
change affects only new deployments, so redeploy Preview after changing one.
Local `.env.local` should normally point to the local Supabase stack.

## Schema promotion

1. Create a migration with `npx supabase migration new <name>`.
2. Validate from empty state with `npx supabase db reset --local --no-seed` and
   run `npx supabase test db --local`.
3. Open and approve the code PR. Announce the schema change in the PR.
4. Link an isolated worktree to `college-crew-preview`, check
   `npx supabase migration list`, then run `npx supabase db push --dry-run`.
5. Push to Preview, test the Preview deployment, and run the database/security
   advisors. Compare findings with the known Production baseline.
6. Link explicitly to Production, repeat the dry run, and promote the exact
   same reviewed migration. Never hand-edit one hosted schema to imitate the
   other.

The linked project ref is stored under `supabase/.temp/` and is local state.
Always run `npx supabase projects list` and `npx supabase migration list` before
a hosted push; do not infer the target from the terminal directory alone.

## Durable test personas

The idempotent `npm run seed:preview` command creates or resets:

- `synthetic-customer@college-crew.example.test`
- `synthetic-provider@college-crew.example.test`
- `synthetic-admin@college-crew.example.test`

All three use the password supplied at runtime. The provider starts pending,
inactive, and admin-forced-inactive, with no Stripe account or public image, so
the seed command cannot publish it to Browse. Complete approval and Stripe test
onboarding manually when a test requires a public/payable provider.

From the repository root, obtain the Preview `secret` API key from Supabase
Dashboard → Project Settings → API Keys, choose a unique test-only password,
and enter both through hidden zsh prompts:

```sh
export SUPABASE_PREVIEW_URL=https://wxexfpcktzecaipndmzu.supabase.co
read -s "SUPABASE_PREVIEW_SERVICE_ROLE_KEY?Preview secret API key: "
echo
read -s "PREVIEW_TEST_PASSWORD?Shared test password (12+ characters): "
echo
export SUPABASE_PREVIEW_SERVICE_ROLE_KEY PREVIEW_TEST_PASSWORD
npm run seed:preview
unset SUPABASE_PREVIEW_SERVICE_ROLE_KEY PREVIEW_TEST_PASSWORD
```

The prompts do not echo or write either value to shell history. The script
refuses Production and every unknown project. Do not save these values in the
repository, Vercel, or `.env.local`.

The personas are the only permanent exception to Preview fixture cleanup. Tag
every other test row visibly and remove it after the test.

## Auth and Edge Functions

Preview Auth accepts localhost callback URLs plus the College Crew Vercel
Preview wildcard. Email confirmation is disabled. Because this Free project
uses Supabase's default SMTP, custom Auth email templates could not be copied;
the defaults remain in place.

All ten checked-in Edge Functions are deployed with their checked-in JWT
settings. Supabase supplies `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and
`SUPABASE_SERVICE_ROLE_KEY` automatically. Full mobile payment, scheduler,
school-email, and notification testing additionally requires Preview-only Edge
Function secrets:

- Stripe test values: `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`
- A signing secret created for the Preview Edge Function endpoint:
  `STRIPE_WEBHOOK_SECRET` (do not reuse the Vercel webhook secret)
- Scheduler: `BOOKING_CRON_SECRET`, `PUBLIC_SITE_URL`
- Optional delivery/moderation: `RESEND_API_KEY`, `EMAIL_FROM`,
  `FOUNDER_OPERATIONS_EMAILS`, `OPENAI_API_KEY`, `SEND_PUSH_SECRET`

Unset optional email/moderation secrets fail closed or no-op according to the
function code. Never copy live Stripe or production webhook secrets into
Preview.

## Free-project operations

If Supabase pauses the Preview project after inactivity, restore it in the
Supabase dashboard before testing, then confirm migrations, functions, and
secrets are still present. Keep the project active with real testing, not a
synthetic keep-alive job. If the Free plan later limits available projects,
preserve Production and recreate Preview from migrations rather than combining
their data.
