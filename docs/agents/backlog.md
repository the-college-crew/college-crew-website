# Backlog

The queue. See `README.md` for statuses and rules.

**To approve:** change `**Status:** proposed` to `**Status:** approved`.
**To reject:** change it to `**Status:** rejected` and add a line to
`decisions.md` saying why — that line is what stops it coming back.

---

## CC-001 — Split Preview environment off the production Supabase project

**Status:** rejected — deferred to a human, before launch. See `decisions.md`.
**Proposed:** 2026-08-02 — seeded by hand, not by an agent
**Effort:** L

`vercel env ls` confirms `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are each a
single value scoped to **Preview and Production**. Every preview deployment —
every branch, every PR — therefore runs against the production database using
the service-role key that bypasses RLS.

Create a second (free-tier) Supabase project, reconcile the drift between the
118 files in `supabase/migrations/` and the live schema, apply them, seed
synthetic data, then repoint the three Preview variables at it.

**Why it matters:** this is a live exposure in the current workflow, with or
without agents. It is the most likely mechanism behind synthetic providers
reaching the live Browse page twice. It also unblocks everything the agent
system wants to do with data.

**Devil's advocate:** the drift reconciliation is unscoped — it could be an
afternoon or a week, and nobody knows until production's schema is dumped and
diffed. Counter: the exposure is real today and the drift is a standing hazard
regardless, so the work has value even if the agent system never ships.

---

## CC-005 — Cache the Browse page's catalog reads with Next 16's `"use cache"`

**Status:** rejected
**Proposed:** 2026-08-02 — Proposer (trial run)
**Effort:** S

`getLiveServices()` and `getServiceProviderCounts()` in `lib/db/queries.ts`
back `app/(customer)/browse/page.tsx` and read the admin-toggled `services`
table — data that's identical for every visitor and only changes when an
admin flips a toggle, per `CLAUDE.md`'s "keep the curated service list driven
by the `services` table" convention. Every Browse request re-queries Supabase
for it anyway. Next.js 16's `"use cache"` directive is the current guidance
for exactly this shape of read (explicit opt-in, replacing the old implicit
full-route cache); wrapping these two functions with `"use cache"` and a short
revalidate (e.g. 60s) drops the redundant round-trip without touching the
personalized parts of the same page (session, geo origin, sort), which stay
dynamic.

**Why this one:** it's the only survivor that's purely additive — no
user-facing behavior changes at all — which makes it a good third leg
alongside two proposals that do change what's displayed. It also keeps the
"services table, never hard-coded" architecture intact while removing the
redundant fetch, which is a better precedent to set now than after traffic
grows past the pilot.

**Devil's advocate:** at 6 providers and one neighborhood, Supabase load was
never the bottleneck — this optimizes something that isn't slow yet. It
survives anyway because the fix is close to free (a directive and a number),
carries no risk to correctness (the cached data changes only via admin
action), and there's no cost to having it in place before it's needed.

---

## CC-006 — Label reviews as "Verified booking" on the provider profile page

**Status:** in-progress — PR #172 open, awaiting Zach's merge
**Proposed:** 2026-08-03 — Proposer
**Effort:** S

`public.reviews` cannot exist without a completed booking:
`supabase/migrations/20260715221943_hourly_rollout_public_review_security.sql`'s
`set_review_public_dimensions` trigger derives `provider_id`/`service_id` from
`bookings` and raises `REVIEW_BOOKING_NOT_FOUND` if none exists, and
`submitReview` in `app/(customer)/dashboard/actions.ts` only inserts once
`booking.status === "completed"` for the reviewing customer's own booking
(enforced again by RLS). Every review rendered in
`components/provider-profile.tsx` (~lines 257–289) is therefore already,
structurally, tied to a real transaction — but nothing in the UI says so; it
reads like any open review widget a stranger could post to.

2025–2026 marketplace trust research is consistent that tagging reviews as
tied to a completed transaction is a first-booking-conversion trust signal,
especially for a platform with no established brand yet. Add a small
"Verified booking" label next to each review's star rating in
`provider-profile.tsx` — no new query and no schema change, since the
guarantee already holds for every row `provider_reviews` returns.

**Why this one:** unlike the verification-heavy ideas the same research
surfaced (background-check tiers, continuous re-verification selfies), this
needs no new infrastructure or data — the codebase already enforces the exact
guarantee the label states. It's stating a fact the database already proves,
not building a new one.

**Devil's advocate:** with 6 providers and a handful of reviews total this
pilot, almost nobody has enough reviews yet for the label to compound into a
real trust signal — it may read as a solitary tag on one review for a while.
It survives anyway because it costs nothing as reviews accumulate and there's
no future point at which shipping it early turns out to have been wrong.

---

## CC-007 — Add `role="alert"` to the shared `FieldError` component

**Status:** in-progress — PR open, awaiting Zach's merge (see PR)
**Proposed:** 2026-08-03 — Proposer
**Effort:** S

`components/ui/field.tsx`'s `FieldError` renders a plain `<p>` with no ARIA
role, but it's the shared error surface for 43 files across the app —
booking forms, `app/(customer)/dashboard/review-form.tsx`, the dispute form,
onboarding, and more. Screen readers only announce content that appears
inside a live region or carries `role="alert"`/`role="status"`; without one, a
rejected submission is silent to anyone not looking at the screen. The
codebase already treats `role="alert"` as its standard for inline errors
elsewhere — `components/chat/chat-thread.tsx:318`,
`components/messaging/resolve-button.tsx:31`,
`app/(customer)/support/support-form.tsx:226`, and
`app/(customer)/bookings/[id]/counter/counter-form.tsx:161` all hand-roll
their own `<p role="alert">`/`<span role="alert">`. `FieldError` is the one
shared component that skipped it.

Add `role="alert"` to `FieldError` in `components/ui/field.tsx`. One
component, one file, and all 43 call sites inherit the fix immediately.

**Why this one:** it's an internal inconsistency, not a speculative external
standard — the project already committed to `role="alert"` for inline errors
in four other components; this closes the gap in the one component built to
be reused everywhere else, making it the highest-leverage single-line fix
available this run.

**Devil's advocate:** none of these forms have a reported accessibility
complaint, so this could look like fixing a bug nobody has hit yet. It
survives anyway because the fix is a one-line, zero-risk addition matching an
already-adopted internal pattern — there's no plausible way for it to make
anything worse, and waiting for a complaint means shipping the visible-only
version of every form in the meantime.

---
