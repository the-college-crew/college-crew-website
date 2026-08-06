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

## CC-008 — Add baseline HTTP security headers (no CSP yet)

**Status:** approved
**Proposed:** 2026-08-05 — Proposer
**Effort:** S

`apps/web/next.config.ts` ships zero HTTP security headers — no `headers()`
export at all, and there's no `middleware.ts` in the app either (confirmed
by grep across `apps/web`). Vercel does not add any of its own; the only
header it appends is `X-Vercel-Id` for request tracing, so the app currently
sends whatever Next.js sends by default for these, which is nothing. This is
the app that collects login credentials, driver's-license photos (the
`serverActions.bodySizeLimit` comment in the same file references the ID
upload flow directly), and live Stripe payments — exactly the surface 2026
guidance says shouldn't ship without the baseline header set.

Add `async headers()` to `next.config.ts` returning `X-Content-Type-Options:
nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`,
`X-Frame-Options: DENY`, and a conservative `Permissions-Policy` (disable
camera/microphone/geolocation, none of which the app uses). All four are the
"safe pack" every 2026 guide recommends without caveats — unlike a full
Content-Security-Policy, none of them restrict which scripts, styles, or
connections are allowed to load, so there's no risk of silently breaking
Stripe Elements, Supabase Realtime websockets, Google OAuth redirects, or the
Brandfetch logo fetches already in the app.

**Why this one:** a genuine, verified-zero gap on a payment- and
ID-upload-handling site, fixable in one function in one file, with no
interaction risk against the third-party embeds already in use. A full CSP
is the more complete fix, but current guidance says to roll it out in
report-only mode for 2–4 weeks before enforcing — real ongoing work, not a
same-day change, and getting it wrong risks silently breaking the Stripe
checkout flow, a live-money path. This candidate deliberately stops short of
that.

**Devil's advocate:** at 6 providers and a handful of users, this pilot
isn't a realistic clickjacking/MIME-sniffing target yet. True — but the fix
costs one function, carries no ongoing maintenance burden, and has zero
interaction risk with anything else in the app, so there's no reason to wait
for an actual incident before shipping something this cheap and this safe.

---

## CC-009 — Add a "Payments secured by Stripe" line next to the pay button

**Status:** approved
**Proposed:** 2026-08-05 — Proposer
**Effort:** S

`app/(customer)/bookings/[id]/confirm/page.tsx` already surfaces the
cancellation policy right next to the payment panel
(`booking-customer.confirm.cancellation-policy`, added by CC-003), but says
nothing about payment security at the one moment a customer is about to hand
over a card number to `HourlyPayPanel`/`ConfirmPayPanel`
(`@stripe/react-stripe-js`, `lib/stripe/`) — a real, live-in-production
integration per `CLAUDE.md`, but the confirm page never says so. 2025–2026
marketplace trust research is consistent that a "secure payments" line is
one of the core, low-cost trust signals at a payment moment, alongside
identity verification and reviews.

Add a one-line "Payments secured by Stripe" note next to the pay panel, as a
new copy key following the same `bookingCopyValue`/admin-editable-copy
convention CC-003 already used for the cancellation line — no new
infrastructure, no invented claim, since Stripe genuinely does process every
charge.

**Why this one:** the same shape as CC-003 and CC-006 — surfacing a true,
already-existing fact at the exact decision point research says it matters
most, using the codebase's own established copy-key pattern rather than
inventing a new mechanism.

**Devil's advocate:** "Stripe" may not mean anything to a customer who
doesn't recognize the brand. True, but the line costs one copy key, Stripe
is a recognizable payment brand for a meaningful share of users, and even a
reader unfamiliar with it reads "payments secured by a named company" as
more credible than no statement at all.

---

## CC-010 — Add Open Graph and Twitter Card metadata to the root layout

**Status:** proposed
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
