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

## CC-010 — Add Open Graph and Twitter Card metadata to the root layout

**Status:** in-progress — PR #231 open, awaiting Zach's merge (complete; see PR body's progress record)
**Proposed:** 2026-08-06 — Proposer
**Effort:** S

`app/layout.tsx` already sets `metadataBase`, a `title` template, and a
`description` (from `lib/site.ts`'s `SITE` constant) — but a repo-wide search
finds zero `openGraph` or `twitter` fields anywhere in the app, on any page.
Every link to College Crew — a flyer QR scan, a text to a neighbor, a share
in a campus group chat — currently unfurls as a bare URL on iMessage,
WhatsApp, Slack, Discord, and every other surface that reads Open Graph tags,
instead of a title, description, and image. `next.config.ts`'s own comments
describe the flyer/QR rewrite system (`/f/:slug` → `/browse`) as the pilot's
actual acquisition mechanism — this is a hyperlocal, word-of-mouth-driven
pilot, and word of mouth today mostly travels as a pasted link.

Add `openGraph` and `twitter` objects to the root `metadata` export in
`app/layout.tsx`, using the existing `SITE.name`/`SITE.description` and the
existing `college-crew-mark.png` logo already in `apps/web/public/` as the
image — no new asset, no new copy to invent. Per-page metadata (browse,
provider profiles, FAQ, etc.) inherits this by Next.js's normal metadata
merging unless a page already overrides it, so one change gives every
existing page a real share card immediately.

**Why this one:** the same "one shared surface, every page inherits it" shape
as CC-007's `FieldError` fix — a single, verified-zero gap in the one file
that already holds the site-wide metadata baseline (`metadataBase`, `title`,
`description`), fixed with data the codebase already has.

**Devil's advocate:** at pilot scale, the number of links actually shared is
small, so this may not move a measurable number yet. It survives anyway
because the fix is one metadata block using existing brand assets, costs
nothing ongoing, and is exactly the kind of thing that's much cheaper to add
now — before dozens of provider and blog pages exist to (not) inherit it —
than to retrofit later.

---
