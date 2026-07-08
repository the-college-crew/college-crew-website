# College Crew — CLAUDE.md

Student-only home-services marketplace (named "College Crew"). A curated,
hyperlocal web app connecting neighbors with verified student providers (18+)
for everyday home/household services. 7-week pilot, one neighborhood, goal =
proof of concept.

**Full product spec:** `docs/SPEC.md` — read it before planning any feature.
**Visual reference:** `docs/wireframe.html` — open it to see screen layout.

Github repo is PRIVATE (the-college-crew org, GitHub Free plan). Still never
commit secrets or credentials — keep keys in `.env.local` (gitignored). Note:
on a free private repo GitHub disables branch protection and rulesets, so
`main` is not machine-protected; land changes via a feature branch + PR by
convention anyway.

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

---

## Stack

- **Framework:** Next.js **16.2.9** (App Router, TypeScript) + **React 19**, on
  **Vercel**
- **Backend:** **Supabase** — Postgres, Auth, Storage, Row-Level Security
- **Payments:** **Stripe Connect (Express)** — test mode during the pilot
- **Realtime/chat:** Supabase Realtime + a Supabase Edge Function for moderation

> **Framework versions are newer than your training data.** Next.js 16 / React
> 19 have breaking changes (async request APIs, caching defaults, file
> conventions). `AGENTS.md` and `node_modules/next/dist/docs/` are
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

Routes are split into **App Router route groups**, mapped to owners to minimize
merge conflicts during parallel work:

- `app/(customer)/…` → **Zach** — landing, browse, public profile, booking,
  confirm & pay, customer dashboard, about, blog.
- `app/(provider)/…` and `app/(admin)/…` → **Ari** — onboarding, provider
  dashboard, jobs & pricing, profile & settings; admin approval + curation.
- `app/(auth)/…` → **shared** — sign up / log in, role selection, 18+ gate.

Supporting directories:

- `lib/supabase/` — the three Supabase clients (see Code conventions).
- `lib/stripe/` — Stripe server client + Connect helpers (test mode).
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
in `.env.local` only. **Supabase project is provisioned; the Stripe test
account is not set up yet** — Stripe wiring stays placeholder/deferred until it
exists (test mode only regardless).

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
- **Watch `ANTHROPIC_API_KEY`:** if either dev has it set in their shell,
  Claude Code bills the API instead of the Pro plan. Use `/login` to stay on
  the subscription.
- **RLS on by default.** Every table has row-level security; customers and
  providers can only read/write their own rows. Admin role bypasses via policy.
- **Stripe is test mode** for the pilot. Do not flip to live keys without an
  explicit decision.
- **No real PII in seed/test data.**
- **`noindex` is ON during the pilot.** `app/layout.tsx` sets a site-wide
  `robots: { index: false, follow: false }` so Google doesn't index thin,
  unfinished pages. **On launch day, REMOVE that `robots` block** (and add a
  sitemap) so the finished site can be indexed. Don't leave it on by accident.

## Claude Code integrations

When using Stripe, Vercel, Resend, or Supabase in Claude Code utilize MCP (if it exists) for any necessary read or write needed. If applicable, load any corresponding skill/plugins downloaded.


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
