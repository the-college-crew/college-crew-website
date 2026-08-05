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

## Standing working conventions

The **plan-first workflow** (restate → propose → list assumptions → STOP and
wait for approval before editing files), **feature branch + PR instead of
direct pushes**, small present-tense commits, never committing secrets, and
using a service's MCP server where one is authenticated are **standing
conventions across all of Zach's projects**, not College Crew rules. Zach's
Claude Code carries them in `~/.claude/CLAUDE.md`.

They are not repeated here, with one exception worth stating plainly for any
agent or contributor whose environment lacks them:

> **Do not create or edit files for a new page, feature, route, component,
> table, or any change spanning more than one file until you have proposed a
> plan and received explicit approval.** Trivial changes — a typo, a one-line
> fix, formatting — are exempt.

Everything below this line is specific to College Crew.

### Handing work between agents

Claude Code and Codex share this repo but not a memory. **Git is the sync
layer.** When work spans a session, an agent, or a day, write the plan to
`docs/plans/` and commit it — see `docs/plans/README.md` for the convention.

Do not route cross-agent state through a database, a daemon, or a tool-specific
memory store. That was the previous arrangement (a RuFlo SQLite bridge with a
hardcoded path); it was invisible to git, unreadable by the other agent, and
scoped to one project's directory. A committed markdown file is legible to both
agents, to both devs, and to a future venture that shares neither.

### Self-merge PRs confined to `docs/agents/` — don't ask

**A PR whose diff touches nothing outside `docs/agents/` gets merged by whoever
opened it.** Open it, wait for checks, merge it, then report what landed. Do not
leave it open for Zach and do not ask permission — the ask is the bug.

This is **rule 7** in `docs/agents/README.md`, which carries the full statement
and the reasoning. It is repeated here because it is written as a rule for the
scheduled routines, and every routine prompt is told to read that file — while an
ad-hoc session (an `@Claude` approval from Slack, a Codex run, a session started
from a bare request) is not, and so defaults to generic caution and stalls the
queue. **It binds every agent on this repo, not just the routines**, explicitly
including approval sessions that flip a `backlog.md` status or append to
`decisions.md`.

**One other diff self-merges: published blog content.** A PR confined to
`apps/web/content/blog/**`, `apps/web/public/blog/**`, and
`docs/blog/published.md` is prose and a photograph, and it already passed a
human gate — Gianna approves each draft in the Slack canvas before it is
committed. This is **rule 7b** in `docs/agents/README.md`.

⚠ **The bound is strict and absolute.** If even one path outside those sets
appears in the diff — any other file under `apps/`, `supabase/`, `scripts/`,
`docs/plans/`, this file — do not merge. Leave it for Zach and say so. There is
no exception for "the code change is tiny." A PR that edits `backlog.md` *and* a
component is a code PR, and so is one that adds a blog post *and* touches the
blog renderer.

Why it matters enough to duplicate: an approval sitting in an unmerged PR is
invisible to everything that reads `main` — including the Worker that runs
overnight. On 2026-08-03 a Slack approval session self-merged two docs-only PRs
(#154, #155) and then asked permission for a third that was strictly smaller
(#156), which is the inconsistency this section exists to remove.

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

- **Never commit secrets — this repo is public.** All keys live in
  `.env.local` (gitignored), including `apps/web/.env.local`, and are shared
  out-of-band.
- **RLS on by default.** Every table has row-level security; customers and
  providers can only read/write their own rows. Admin role bypasses via policy.
- **Stripe is live in production.** Local and preview environments may use
  test mode, but server and publishable keys must always use the same mode.
- **Production indexing is enabled.** `app/layout.tsx` must not add a
  site-wide `noindex`. Keep `app/robots.ts` and `app/sitemap.ts` aligned with
  public routes; never include authenticated dashboards or unlisted providers.
- **Test/synthetic data hygiene.** Production and hosted Vercel Previews use
  separate Supabase projects. Local E2E tests still use the local Supabase
  stack; never point the E2E suite at either hosted project. Before this split,
  a synthetic provider leaked onto the real Browse page twice, so the original
  protections remain mandatory:
  - Never rely on a bare `afterAll`/happy-path teardown to delete synthetic
    rows. Wrap setup + teardown so cleanup runs even if an assertion fails or
    the run is interrupted (try/finally or the framework's equivalent).
  - Tag synthetic rows unambiguously (e.g. an `@example.test` email, a
    `synthetic-`/`test-` name or slug prefix) so orphaned rows are easy to
    find and sweep with a query if cleanup ever fails.
  - Before ending a task that created temporary synthetic data, query the
    affected project back and confirm zero temporary rows remain. The three
    tagged, durable Preview personas are the only cleanup exception.
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
  - **Hosted Preview runbook: `docs/PREVIEW_ENVIRONMENT.md`** — project
    boundaries, schema promotion, fixture setup, and integration secrets.

## Agent integrations

Use the MCP server for Stripe, Vercel, Resend, or Supabase where one is
authenticated, and load the corresponding skill or plugin.

The Stripe MCP is authenticated **read-only** against the live account
(2026-08-01) — reads are fine, but any write goes through the app's own Stripe
code paths or the dashboard, never a side channel.

## Pilot scope discipline

Build the **pilot v1** described in `docs/SPEC.md`. Several capabilities are
intentionally **deferred** (flexible per-service availability, messaging policy
tuning, native mobile). Do not build deferred items unless asked — when in
doubt, plan first and confirm.

## Blog content lives in git, not the database

Blog posts are markdown files at **`apps/web/content/blog/<slug>.md`** with
YAML frontmatter, rendered through `lib/blog/posts.ts` and
`lib/blog/markdown.ts`. The filename is the slug. Publishing a post is a commit,
not a database write — so no agent needs credentials to ship one, and every post
is reviewable as a diff.

The `blog_posts` table and the `blog-images` bucket still exist but are
**dormant**: nothing reads or writes them, and the admin Blog page that did was
removed. Drop them in a separate migration once the file-based blog has proven
itself.

Full publishing flow: **`docs/blog/PUBLISHING.md`**.

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
