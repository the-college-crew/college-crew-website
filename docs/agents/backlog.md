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

## CC-003 — Surface the cancellation policy on the provider profile page, not just at confirm

**Status:** in-progress — PR open, awaiting Zach's merge (see PR)
**Proposed:** 2026-08-02 — Proposer (trial run)
**Effort:** S

`lib/booking/policy.ts` already computes `CUSTOMER_REFUND_NOTICE_HOURS` (12h)
and the full pre-arrival cancellation classification, and it's shown to the
customer exactly once — at `app/(customer)/bookings/[id]/confirm/page.tsx`,
via the `booking-customer.confirm.cancellation-policy` copy key. Nothing
mentions it earlier: `components/provider-profile.tsx`, the page a customer
reads while deciding whether to book at all, shows rating, verification
badge, and services, but no cancellation terms.

2026 marketplace trust-signal research is consistent that a visible
cancellation/refund policy is a foundational trust signal for a new
marketplace's first-booking funnel, and that it needs to show up before the
commitment step, not only at final payment. Add a one-line "Free cancellation
up to 12 hours before" note to the profile page, sourced from the same
constant already used at confirm — no new policy, no new copy to invent, just
moving an existing fact earlier in the read.

**Why this one:** it's the only survivor that touches actual first-booking
conversion, which is the one thing this 7-week pilot exists to measure — but
unlike a marketing/financial proposal (deliberately deferred per
`decisions.md` until there's real booking data), it doesn't require inventing
a strategy. It surfaces a fact the codebase already computes and already
trusts enough to show at confirm; the risk of being wrong is close to zero.

**Devil's advocate:** with 6 providers on a curated, admin-approved roster,
customers may already trust the platform via the curation itself, making this
marginal. It survives anyway because it's a same-constant, same-copy-pattern,
near-zero-risk change — there's no real downside to shipping it even if the
lift turns out to be small.

---

## CC-004 — Give provider profile pages real metadata and Service structured data

**Status:** approved
**Proposed:** 2026-08-02 — Proposer (trial run)
**Effort:** S/M
**Plan:** docs/agents/plans/CC-004.md

`app/(customer)/providers/[id]/page.tsx` exports one static
`metadata: Metadata = { title: "Provider profile" }` for every provider —
identical title for all of them — and a repo-wide search turns up zero
`application/ld+json` or schema.org markup anywhere in the app. Meanwhile
`app/sitemap.ts` already lists every approved provider's public profile, and
`CLAUDE.md` treats production indexing as a standing guardrail ("must not add
a site-wide `noindex`"). The infrastructure assumes these pages are meant to
rank; the on-page signals search engines and AI answer engines actually use
are missing.

Add `generateMetadata` (provider name, primary service, town) and a `Service`
JSON-LD block with `aggregateRating` sourced from the rating data
`lib/browse/ranking.ts` already computes. Metadata-only change — no data
mutation, no schema change.

**Why this one:** it's the cheapest fix for a guardrail the project already
committed to (indexing on) but never followed through on for the one page
type — provider profiles — that's actually meant to be found externally.

**Devil's advocate:** with ~6 providers in one neighborhood, no amount of
markup makes Google send meaningful traffic in a 7-week pilot — this is real,
and it's the strongest objection of the three survivors. It survives anyway
because the fix is well under a day, carries zero product risk, and is the
kind of thing that's far cheaper to do now (one profile template) than to
retrofit once there are dozens of provider pages.

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
