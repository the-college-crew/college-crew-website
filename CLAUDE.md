# College Crew — agent instructions

> This one file is the project's instructions for **every** coding agent.
> `AGENTS.md` is a symlink to it, so Claude Code and Codex read the same rules
> and cannot drift apart. Edit this file; both names follow.

Student-only home-services marketplace (named "College Crew"). A curated,
hyperlocal web app connecting neighbors with verified student providers (18+)
for everyday home/household services. 7-week pilot, one neighborhood, goal =
proof of concept.

**Full product spec:** `docs/SPEC.md` — read it before planning any feature.
**Visual reference:** `docs/wireframe.html` — open it to see screen layout.

Github repo is PUBLIC (the-college-crew org). Kept public deliberately:
Vercel's free Hobby plan won't auto-deploy a private *organization-owned* repo,
and this project relies on push-to-deploy — so making the repo private breaks
production deploys (going private would require upgrading Vercel to Pro, or
moving the repo to a personal GitHub account). Because it's public, NEVER
commit secrets or confidential info — keys live in `.env.local` (gitignored).

---

## Workflow: plan and confirm before building

Before writing or editing ANY code for a new page, feature, route, component,
database table, or any change spanning more than one file, you MUST:

1. Restate the request in your own words so we can confirm you understood it.
2. Propose a short plan: which files you'll create or change, the approach,
   any database/schema impact, and anything that depends on a decision not
   yet made.
3. List your assumptions and any open questions — ask them before proceeding.
4. STOP and wait for explicit approval ("go" / "approved"). Do NOT create or
   edit files until you receive it.

This applies even when plan mode is NOT active. Treat every non-trivial task
as plan-first by default.

Proceed without a plan ONLY for trivial changes: a typo, an obvious one-line
fix, formatting, or something explicitly described as "just do it."

If, while building, reality diverges from the approved plan (a wrong
assumption, a missing file, an unexpected dependency), STOP and surface it.
Do not improvise around it — return to planning and get agreement first.

When a request is ambiguous, ask clarifying questions instead of guessing.

### Handing work between agents

Claude Code and Codex share this repo but not a memory. **Git is the sync
layer.** When work spans a session, an agent, or a day, write the plan to
`docs/plans/` and commit it — see `docs/plans/README.md` for the convention.

Do not route cross-agent state through a database, a daemon, or a tool-specific
memory store. That was the previous arrangement (a RuFlo SQLite bridge with a
hardcoded path); it was invisible to git, unreadable by the other agent, and
scoped to one project's directory. A committed markdown file is legible to both
agents, to both devs, and to a future venture that shares neither.

---

## Stack

- **Framework:** Next.js **16.2.9** (App Router, TypeScript) + **React 19**, on
  **Vercel**
- **Backend:** **Supabase** — Postgres, Auth, Storage, Row-Level Security
- **Payments:** **Stripe Connect (Express)** — live mode in production
- **Realtime/chat:** Supabase Realtime + a Supabase Edge Function for moderation

> **Framework versions are newer than your training data.** Next.js 16 / React
> 19 have breaking changes (async request APIs, caching defaults, file
> conventions). `node_modules/next/dist/docs/` is
> **authoritative over anything you remember** — read the relevant guide before
> writing route, server-component, or data-fetching code.

## Commands (once scaffolded)

- `npm run dev` — local dev server
- `npm run build` / `npm run start` — production build / serve
- `npm run lint` / `npm run typecheck` — checks before committing (both scripts
  plus eslint + typescript are added in the skeleton build; the base scaffold
  ships only dev/build/start)
- `npx supabase migration new <name>` / `npx supabase db push` — schema changes

## Architecture / folder layout

**Monorepo (npm workspaces):** the Next.js web app lives in `apps/web/`; the
iOS app (React Native/Expo) will live in `apps/mobile/`, with shared code in
`packages/`. `supabase/` and `docs/` stay at the repo root. All paths below
are relative to `apps/web/`. Root `package.json` scripts (`npm run dev`,
`build`, `lint`, `typecheck`, …) delegate to the web workspace.

Routes are split into **App Router route groups**, mapped to owners to minimize
merge conflicts during parallel work:

- `app/(customer)/…` → **Zach** — landing, browse, public profile, booking,
  confirm & pay, customer dashboard, about, blog.
- `app/(provider)/…` and `app/(admin)/…` → **Ari** — onboarding, provider
  dashboard, jobs & pricing, profile & settings; admin approval + curation.
- `app/(auth)/…` → **shared** — sign up / log in, 18+ gate.

**Unified accounts (since 2026-07-16):** "provider" is a capability of the
base account, not an account type. `profiles.role` only distinguishes `admin`
from regular accounts (all `customer`); a user is a provider iff they own a
`provider_profiles` row, created when they start onboarding (any signed-in
regular account can). Providers keep every customer feature (browse, book,
message — including other providers). Guards: self-booking and self-messaging
are blocked, admin accounts can't book, and provider capability requires
accepting the provider variant of the master agreement (a superset of the
customer one — `legal_acceptances.role` stores the accepted *variant*, not the
account role). Gate helpers: `requireRole("admin"|"customer")`,
`requireProviderAccess()` (work surface), `requireOnboardingUser()`
(onboarding). The `provider` enum value still exists in the DB type but is
dead — never assign or read it.

Supporting directories:

- `lib/supabase/` — the three Supabase clients (see Code conventions).
- `lib/stripe/` — Stripe server client + Connect helpers (live in production,
  test mode permitted locally and in previews).
- `lib/db/types.ts` — generated Supabase DB types (single source of truth for
  row shapes).
- `components/` — shared UI; area-specific components co-locate under their
  route group.
- `app/actions/` (or co-located `actions.ts`) — Server Actions for mutations.
- `supabase/migrations/` — schema; one owner runs migrations (see below).

**Environment:** the skeleton ships a committed `.env.example` enumerating all
required vars — `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`, plus Stripe (`STRIPE_SECRET_KEY`,
`NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`). Real values live
in `.env.local` only. Supabase and Stripe Connect are provisioned. The complete
Stripe integration lives under `lib/stripe/` and `app/api/webhooks/stripe/`;
production uses live credentials while local and preview environments may use
the separate Stripe sandbox.

## Conventions

- **Branching:** commit work through a feature branch + PR into `main`, not
  direct pushes. Direct-to-`main` only when explicitly agreed for a given
  change (e.g. a quick doc fix). This supersedes the earlier "direct to main
  is OK" guidance now that branch + PR is the standing convention.
- **Commits:** small and frequent, present-tense messages ("add booking form").
- **Module ownership (to minimize merge conflicts — confirm/adjust):**
  - Zach → customer-facing (landing, browse, public profile, booking,
    confirm & pay, customer dashboard, about, blog)
  - Ari → provider-facing (onboarding, dashboard, jobs, profile & settings)
    and admin
  - Shared (coordinate before changing): auth, messaging, the data model,
    this file.
- **Migrations:** one owner runs schema changes so the shared Supabase project
  doesn't get conflicting edits. Announce schema changes in the PR.

## Guardrails

- **Never commit secrets.** All keys live in `.env.local` (gitignored) and are
  shared out-of-band, never in the repo.
- **Watch provider API keys in the shell.** If `ANTHROPIC_API_KEY` is set,
  Claude Code bills the API instead of the Pro plan — use `/login` to stay on
  the subscription. Same idea for Codex and its own key.
- **RLS on by default.** Every table has row-level security; customers and
  providers can only read/write their own rows. Admin role bypasses via policy.
- **Stripe is live in production.** Local and preview environments may use
  test mode, but server and publishable keys must always use the same mode.
- **No real PII in seed/test data.**
- **Production indexing is enabled.** `app/layout.tsx` must not add a
  site-wide `noindex`. Keep `app/robots.ts` and `app/sitemap.ts` aligned with
  public routes; never include authenticated dashboards or unlisted providers.
- **Test/synthetic data hygiene.** There is no separate staging Supabase
  project — dev and prod point at the same database, so any script or test
  that inserts rows there is live the instant it runs. This has already let a
  synthetic "provider" account leak onto the real Browse page twice (once via
  an agent-written E2E test whose cleanup didn't run). To prevent a repeat:
  - Never rely on a bare `afterAll`/happy-path teardown to delete synthetic
    rows. Wrap setup + teardown so cleanup runs even if an assertion fails or
    the run is interrupted (try/finally or the framework's equivalent).
  - Tag synthetic rows unambiguously (e.g. an `@example.test` email, a
    `synthetic-`/`test-` name or slug prefix) so orphaned rows are easy to
    find and sweep with a query if cleanup ever fails.
  - Before ending a task that created synthetic data in the shared project,
    query the affected table(s) back and confirm zero synthetic rows remain
    — don't just trust that the teardown code ran.
  - A one-off verification script (an E2E test written to check a single
    feature once, not meant to join the standing suite) must say so in a
    comment, and should be deleted once it's served its purpose — don't
    leave it in the repo where a later run (by either dev, or another
    agent) can re-trigger the same leak.
  - **Full playbook: `docs/SHARED_DB_SAFETY.md`** — the live exposure gate that
    puts a provider on Browse, the sweep query, and the verified FK cleanup
    order. E2E specs must build their service-role client with
    `createLocalAdminClient()` from `tests/e2e/support/admin.ts`, which refuses
    any URL that is not localhost.

## Agent integrations

When using Stripe, Vercel, Resend, or Supabase, use the MCP server for that
service (if one exists and is authenticated) for any read or write needed, and
load any corresponding skill or plugin. Applies to Claude Code and Codex alike.

The Stripe MCP is authenticated **read-only** against the live account
(2026-08-01) — reads are fine, but any write goes through the app's own Stripe
code paths or the dashboard, never a side channel.


## Pilot scope discipline

Build the **pilot v1** described in `docs/SPEC.md`. Several capabilities are
intentionally **deferred** (flexible per-service availability, blog content
generation, messaging policy tuning, native mobile). Do not build deferred
items unless asked — when in doubt, plan first and confirm.

## Code conventions

- TypeScript everywhere; prefer server components, use client components only
  when interactivity requires it. (The base scaffold is currently JavaScript —
  the skeleton build converts it to TypeScript: adds `tsconfig.json`,
  `typescript` + `@types`, and renames existing files.)
- **Supabase clients live in `lib/supabase/` and come in exactly three flavors,
  never instantiated ad hoc:**
  - `client.ts` — **browser** client (anon key), for client components.
  - `server.ts` — **server** client (anon key, cookie-based session), for
    server components, route handlers, and Server Actions.
  - `admin.ts` — **service-role** client that **bypasses RLS**. Server-only —
    must never be imported into anything shipped to the browser.
- Keep the curated service list driven by the `services` table (admin-toggled),
  never hard-coded in the UI.
- **Route-change progress bar:** the app uses `nextjs-toploader`, mounted once
  in `app/layout.tsx` with the gold color `#c5c27d` (chosen to read over both
  the forest header and cream body). It applies globally across all routes — any
  new routing additions inherit it automatically. Don't add a second loader or
  override its color; keep the single site-wide instance in that one gold.
