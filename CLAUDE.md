# HomeGrown — CLAUDE.md

Student-only home-services marketplace (working name "HomeGrown"). A curated,
hyperlocal web app connecting neighbors with verified student providers (18+)
for everyday home/household services. 7-week pilot, one neighborhood, goal =
proof of concept.

**Full product spec:** `docs/SPEC.md` — read it before planning any feature.
**Visual reference:** `docs/wireframe.html` — open it to see screen layout.

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

- **Framework:** Next.js (App Router, TypeScript) on **Vercel**
- **Backend:** **Supabase** — Postgres, Auth, Storage, Row-Level Security
- **Payments:** **Stripe Connect (Express)** — test mode during the pilot
- **Realtime/chat:** Supabase Realtime + a Supabase Edge Function for moderation

## Commands (once scaffolded)

- `npm run dev` — local dev server
- `npm run build` / `npm run start` — production build / serve
- `npm run lint` / `npm run typecheck` — checks before committing
- `npx supabase migration new <name>` / `npx supabase db push` — schema changes

## Conventions

- **Branching:** work on feature branches off an updated `main`; open a PR to
  merge. Never commit directly to `main`.
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

## Pilot scope discipline

Build the **pilot v1** described in `docs/SPEC.md`. Several capabilities are
intentionally **deferred** (flexible per-service availability, blog content
generation, messaging policy tuning, native mobile). Do not build deferred
items unless asked — when in doubt, plan first and confirm.

## Code conventions

- TypeScript everywhere; prefer server components, use client components only
  when interactivity requires it.
- Co-locate the Supabase client in a single `lib/supabase` module; never
  instantiate clients ad hoc.
- Keep the curated service list driven by the `services` table (admin-toggled),
  never hard-coded in the UI.
