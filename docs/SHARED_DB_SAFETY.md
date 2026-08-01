# Shared-database safety

There is no staging Supabase project. Dev and prod are **one database**, and it
backs a live-mode Stripe Connect platform. Every row a script or test inserts is
in production the instant it runs.

This is a playbook for that specific architecture, not general test hygiene. The
rules below are each tied to something verified in this repo or in the running
database on 2026-08-01; anything unconfirmed is marked as such.

---

## The exposure gate: what makes a row public

A synthetic provider becomes visible to anonymous visitors on `/browse` when it
passes `public.public_provider_directory`. Pulled from the running database
(`pg_get_viewdef` + `pg_get_functiondef`), not from the migration files — the
migrations contain **stale earlier definitions** of `is_provider_approved`, so
read the live definition before trusting anything here.

The view is `security_invoker=true` over `provider_profiles` and requires:

| # | Condition | Where |
|---|---|---|
| 1 | `verification_status = 'approved'` | `is_provider_approved()` |
| 2 | `is_active` | `is_provider_approved()` |
| 3 | `NOT admin_forced_inactive` | `is_provider_approved()` |
| 4 | `stripe_account_id IS NOT NULL` | `is_provider_approved()` |
| 5 | `stripe_transfers_active` | `is_provider_approved()` |
| 6 | `stripe_transfers_checked_at IS NOT NULL` | `is_provider_approved()` |
| 7 | `avatar_image_path IS NOT NULL` | the view body |

Offerings additionally need `services.is_live` on the joined service.

**The point of this table is that hardening the gate does not help.** Seven
conditions did not prevent the leak, because a fixture that wants a provider on
Browse sets all seven on purpose. The gate is strong against half-built rows and
irrelevant against deliberately complete ones — and a test fixture is, by
construction, deliberately complete.

As of 2026-08-01 the live project has 23 provider profiles (15 approved), but
`stripe_transfers_active` is false for all 23, so the directory returns **zero
rows** and Browse currently shows no providers. Do not read an empty Browse as
proof that nothing leaked.

## What actually happened

Confirmed: commit `6bac660` (2026-07-21) deleted
`apps/web/tests/e2e/photo-focal-point.spec.ts`. Its `beforeAll` inserted a
`provider_profiles` row as `"Focal Point Tester"` with `verification_status:
"approved"`, `stripe_account_id: "acct_e2e_focal_point"`,
`stripe_transfers_active: true`, `stripe_transfers_checked_at: now`, an uploaded
avatar, and an `is_live` service. That satisfied all seven conditions, and the
provider went live on the real Browse page.

Two details worth carrying forward:

- Its teardown was a bare `test.afterAll`, and **every delete discarded its
  error**. A cleanup blocked by a foreign key would finish silently and look
  like success.
- The synthetic tag was on the *service slug* (`synthetic-focal-point-…`), not
  on the provider. The provider's `display_name` was `"Focal Point Tester"` —
  a plausible human name, matching no `synthetic-` or `test-` sweep.

CLAUDE.md and AGENTS.md both say this happened **twice**. Only this one is
recoverable from git history; the second left no trace I could find.
**Unverified.**

## Rules

1. **Never construct a service-role client in a test from raw `process.env`.**
   Use `createLocalAdminClient()` from `apps/web/tests/e2e/support/admin.ts`,
   which throws unless `NEXT_PUBLIC_SUPABASE_URL` resolves to localhost. Build it
   at module scope so a misdirected run dies during collection, before the first
   insert. Verified: a bare `npx playwright test` now fails with
   `E2E REFUSING TO RUN` instead of writing to production.

2. **Run the suite with `npm run test:e2e`, never `npx playwright test`.** The
   runner shells `supabase status`, fails if the local stack is down, and injects
   local URL/keys plus placeholder Stripe/Resend keys. Next.js does not let
   `.env.local` override an already-set `process.env`, so the redirect holds.
   Rule 1 exists because rule 2 is a habit, and habits are what failed.

3. **Check the error on every teardown delete.** Use `runTeardown()` from the
   same module: it attempts every step even after one fails, then throws with the
   list. A teardown that cannot report failure is not a teardown.

4. **Tag the row a human would see, not just the fixture's bookkeeping.**
   `@example.test` emails and `synthetic-` slugs are necessary but were not
   sufficient — the leaked row's `display_name` was untagged and therefore
   unsweepable. Prefix `display_name`, `company_name`, and any other rendered
   string too.

5. **One-off verification scripts say so in a comment and get deleted.** The
   leak came from a script written to check one feature once, left in the repo
   where a later run could re-trigger it.

6. **Sweep before you call the task done.** Run the query below and confirm zero
   rows. Do not trust that the teardown ran.

7. **Validate schema work on the local stack**, never against the shared project
   — `npx supabase db reset --local`, then `npx supabase test db --local`. Note
   ~7 of the 15 pgTAP files fail on a clean local DB as a pre-existing baseline;
   capture a baseline and diff rather than reading those as yours.

## The sweep query

Read-only. Run against the live project (Supabase MCP `execute_sql`) after any
task that may have written synthetic rows.

```sql
select
  (select count(*) from auth.users
     where email ilike '%@example.test')                       as synthetic_auth_users,
  (select count(*) from public.services
     where slug like 'synthetic-%' or slug like 'test-%'
        or category = 'Test')                                  as synthetic_services,
  (select count(*) from public.provider_profiles
     where stripe_account_id like 'acct_e2e%'
        or display_name ilike '%synthetic%'
        or display_name ilike '%test%')                        as synthetic_providers,
  (select count(*) from public.booking_payments
     where stripe_connected_account_id like 'acct_e2e%'
        or stripe_customer_id like 'cus_e2e%')                 as synthetic_payments,
  (select count(*) from public.public_provider_directory)      as visible_on_browse;
```

Every count must be zero except the last. All five were zero on 2026-08-01.

### Cleanup order

Verified against `pg_constraint` on 2026-08-01. Two of these are `RESTRICT`, and
getting the order wrong produces error `23503`, not a cascade:

- `booking_payments.booking_id → bookings` — **RESTRICT**
- `bookings.customer_id → profiles`, `bookings.provider_id →
  provider_profiles`, `bookings.service_id → services` — **RESTRICT**
- `profiles.id → auth.users` — CASCADE
- `legal_acceptances.user_id → profiles`, `provider_profiles.user_id →
  profiles` — CASCADE
- `provider_services.provider_id`, `provider_availability_windows.provider_id →
  provider_profiles` — CASCADE

So the order is: `booking_payments` → `bookings` → `services` →
`provider_profiles` → `auth.users` (which cascades `profiles`,
`legal_acceptances`, `provider_services`, `provider_availability_windows`).

This is not hypothetical. The teardowns deleted `bookings` directly, without
deleting `booking_payments` first and while discarding the delete error — so
every spec that inserted a payment row (work-invoicing, cancellations-disputes)
has been **silently failing to clean up**, leaving both tables behind. It never
surfaced because the error was thrown away. `deleteCustomerBookings()` in
`tests/e2e/support/admin.ts` now does it in the right order, reading booking ids
back from the database so it also catches bookings the browser journey created
under names the spec never knew.

## What is deliberately not done

- **No staging project.** A second free Supabase project is possible, but the
  cost is keeping schema, Stripe Connect, and Resend config in sync across two
  environments — real ongoing work against a 7-week pilot. The localhost guard
  captures most of the risk for a fraction of the effort. Revisit if a second
  developer starts writing fixtures.
- **No CI check.** There is no `.github/workflows/` in this repo at all, so a CI
  guard means standing up CI first. The guard runs locally, where the damage
  happens.
- **RLS does not help here.** The service-role key bypasses it by design. The
  guard has to sit in front of the client, which is where it now is.

## For the next venture

Do not inherit this architecture. A separate staging database from day one costs
an hour at setup and removes this entire document. The guard, the sweep query,
and the seven-condition gate are all compensating controls for a decision that
was cheap to avoid and expensive to live with.
