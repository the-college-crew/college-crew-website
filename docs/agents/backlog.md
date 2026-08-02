# Backlog

The queue. See `README.md` for statuses and rules.

**To approve:** change `**Status:** proposed` to `**Status:** approved`.
**To reject:** change it to `**Status:** rejected` and add a line to
`decisions.md` saying why — that line is what stops it coming back.

---

## CC-001 — Split Preview environment off the production Supabase project

**Status:** proposed
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

## CC-002 — Give Preview its own Resend key

**Status:** proposed
**Proposed:** 2026-08-02 — seeded by hand, not by an agent
**Effort:** S

`RESEND_API_KEY` is scoped to **Preview and Production**, so a preview
deployment can send real email to real customers and providers using the
production sender. `EMAIL_FROM` is already split per environment; the API key
is not.

Add a Preview-scoped key — a sandbox domain, or simply no key at all, since
`.env.example` documents that a missing key keeps email testable without
delivery.

**Why it matters:** small change, removes an entire category of accident.
Unlike CC-001 it has no prerequisites and could be done in ten minutes.

**Devil's advocate:** no real objection. Stripe is already split this way, so
this is just bringing Resend in line with an existing pattern.

---
