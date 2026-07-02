# CollegeCrew — Product Spec (Pilot v1)

Read this before planning any feature. It's the authoritative text reference;
`wireframe.html` is the visual companion. Where they differ, this doc wins
(the wireframe is v1 and lags two screens — see §8).

---

## 1. Product summary

CollegeCrew is a curated, hyperlocal marketplace connecting neighbors with
verified student providers (18+) for everyday home and household services.
Providers are **either student-run businesses or individual students**,
depending on the service (e.g. window washing → a business; babysitting → an
individual). Customers browse, book, and pay in-app; the platform processes
payment and keeps a commission.

**The wedge (why this, not TaskRabbit / Facebook Marketplace):**
- Students only (18+) — the brand and the moat.
- Curated services — we choose what's offered and manage quality; not an open
  listing site.
- Hyperlocal launch — one neighborhood, seeded via the founders' network.
- Mission-driven brand — "back young people," an emotional pitch (owned by
  marketing).

## 2. Pilot goal & scope

- **7-week pilot, one neighborhood.** Goal is **proof of concept**: students
  sign up, customers book, and money flows cleanly through the platform — not
  revenue.
- Responsive **web app, mobile-first** (no native app — avoids app-store delay
  in the pilot window).
- ~8 providers (1–2 per service), volume figures are illustrative.

## 3. Locked decisions

- **Take rate: 15%**, charged to the provider, collected automatically in-app.
- **Platform absorbs Stripe fees** (2.3% + $0.30) out of its cut — customer
  pays only the job price (~$15 net on a $120 job; ~12.5% effective rate).
- **Charge after acceptance.** Customer *requests* (no charge) → provider
  *accepts* → customer gets a notice with full details and a **Confirm & pay**
  button → payment runs → booking confirmed.
- **18+ only at launch** — deliberate, for legal simplicity. Verified via .edu
  email + manual student-ID review.
- **Liability** for the work rests with the independent providers; the platform
  connects, verifies, and processes payments. State this in ToS.
- **Optional paid background check** — a trust badge + small platform margin.
- **Pricing lives in Provider → Profile & settings** (single source of truth);
  the Jobs page shows pricing read-only.
- **Blog** ships as an empty page/route for the demo (no content yet).
- **In-app messaging with automated moderation** is in scope (see §7).

## 4. Users & roles

- **Customer** — browses, books, pays, reviews.
- **Provider** — onboards, gets verified, connects Stripe, sets services +
  pricing + availability, accepts/declines jobs.
- **Admin (founders)** — approves providers (verification gate), curates which
  services are live, oversees bookings. Founders-only.

Role is chosen at signup and stored on the profile; it routes the experience.

## 5. Data model (starting point)

- **profiles** (extends Supabase auth): `id`, `role` (customer|provider|admin),
  `full_name`, `created_at`.
- **services** (admin-curated catalog): `id`, `name`, `slug`, `category`,
  `is_live`. UI reads from here — never hard-code the service list.
- **provider_profiles**: `id`, `user_id`→profiles, `display_name`, `bio`,
  `provider_type` (business|individual), `neighborhood`,
  `verification_status` (pending|approved|rejected), `id_document_url`,
  `background_check_status` (none|pending|passed), `stripe_account_id`
  (null until connected post-approval), `availability` (jsonb — flexible,
  varies by service/provider), `created_at`.
- **provider_services** (offered services + pricing): `id`,
  `provider_id`→provider_profiles, `service_id`→services, `price`,
  `price_type` (fixed|quote), `unit` (per_job|per_hour).
- **bookings**: `id`, `customer_id`, `provider_id`, `service_id`, `status`
  (see state machine), `scheduled_at`, `address`, `details`, `price`,
  `platform_fee`, `stripe_payment_intent_id`, `created_at`.
- **reviews**: `id`, `booking_id`, `rating` (1–5), `text`, `created_at`.
- **messages** / **conversations**: thread tied to a provider+customer (and
  optionally a booking); `sender_id`, `body`, `moderation_status`
  (clean|redacted|flagged), `created_at` (see §7).

**Booking state machine (charge-after-accept):**
`requested` → `accepted` (provider) → `paid` (customer confirms & pays) →
`completed`. Branches: `declined` (provider), `cancelled` (customer).

All tables use Row-Level Security; users access only their own rows; admin via
policy.

## 6. Payments (Stripe Connect Express)

- Providers onboard through Stripe's hosted Express flow **after they're
  approved** — Stripe handles their identity + bank details + payouts; we never
  store sensitive data.
- Charges are **destination charges with an application fee** = our 15%, taken
  automatically; the remainder is the provider's payout.
- **Sequence:** request (no charge) → provider accepts → customer "Confirm &
  pay" creates the PaymentIntent → on success, booking = `paid`.
- **Test mode** for the pilot/demo; live keys only on an explicit decision.

## 7. Messaging + moderation (in scope, build the scaffold)

**Why it exists:** some services need image-based quotes and some scheduling
happens in chat; we also want to monitor for off-platform leakage
(disintermediation) over time.

**Architecture:** Supabase Realtime for the live thread; a Supabase **Edge
Function** runs a moderation pass on each message insert *before* delivery, so
it can't be bypassed client-side.

**Two-layer scan:**
1. Cheap regex first pass — obvious phone numbers, emails, @handles, payment
   handles.
2. Low-latency model backstop — catches evasions ("five five five…", "find me
   on insta", "venmo same name").

**Critical policy nuance:** the customer's **address and job logistics are
legitimate** and must NOT be blocked. Only **off-platform contact channels**
(phone, email, social, payment apps, "text me instead") are the target. The
model prompt must be written around exactly this distinction.

**Handling (recommended default):** redact the offending span inline + warn the
sender, AND log everything for later founder review. Don't hard-block the whole
message.

**Build now:** `messages`/`conversations` tables, chat UI, Realtime wiring, and
the moderation Edge Function with the **regex layer working** and a clearly
marked, pluggable spot for the model call. **Defer:** final policy tuning and
the review dashboard.

**Legal:** ToS must disclose that messages are monitored/scanned (tell Max).

## 8. Screens

Wireframed in `wireframe.html` (v1, 14 screens). Two newer screens — **Confirm
& pay** and **Messaging** — are specified here in text and should be added to
the wireframe next pass.

### Customer
- **Landing** — pitch + how-it-works + service grid; CTAs to Browse and to
  become a provider; links to About and Blog. Mission/brand copy lives here.
- **Browse** — provider list scoped to the launch neighborhood; service-filter
  chips; cards show name, service, price, rating, verified badge. Shows both
  businesses and individuals.
- **Provider profile (public)** — bio, services + pricing, availability,
  reviews, verified + background-check badges; "Request booking". Generated
  from the provider's Profile & settings.
- **Booking (request)** — service, date/time, address, details; shows job price
  with a note that the 15% comes from the provider's cut. Submits a *request*
  (no charge yet).
- **Confirm & pay** *(text-only, add to wireframe)* — triggered when the
  provider accepts. Shows finalized appointment details (service, provider,
  date/time, address, price) and a **Confirm & pay** button that runs Stripe.
  On success → booking `paid`. Reachable from a notification + the customer
  dashboard.
- **Customer dashboard** — Upcoming (requested + confirmed) and **Past**
  (completed, with review prompt) tabs. Pills mirror the booking state machine.
- **About us** — mission, "why students," real team section (Zach, Ari, Max,
  Gianna). Builds trust that this is local people.
- **Blog** — ships as an **empty page/route** for the demo; content later
  (likely AI-drafted: local tips, student spotlights, seasonal checklists).

### Provider
- **Onboarding (wizard)** — step-by-step, **one form per page**, Next/Back:
  (1) account (.edu + 18+ + password), (2) verify (student-ID upload, manual
  review), (3) services + pricing, (4) review & submit. **Stripe is NOT here** —
  it's connected after approval.
- **Provider dashboard** — earnings summary, new requests (accept/decline), a
  **month calendar** (booking days highlighted; tap a day → job + time +
  location), and a post-approval **"Connect Stripe"** banner.
- **Jobs & pricing** — Upcoming jobs list; service pricing shown **read-only**
  here (editing lives in Profile & settings).
- **Profile & settings** — bio, **availability** (flexible — varies by service
  and provider; a simple version is fine for the pilot), and account settings:
  **service pricing (source of truth)**, username, email, password, Stripe
  connection, optional background-check upsell.

### Shared
- **Messaging** *(text-only, add to wireframe)* — per provider+customer thread
  (optionally tied to a booking). Supports text + image (for quotes). Every
  message passes server-side moderation (§7). Entry points: a booking and/or a
  provider profile (see open questions).
- **Admin dashboard** — provider approval queue (review ID → approve/reject,
  which flips status to `approved` and unlocks Stripe) and service curation
  (toggle which services are live).
- **Auth** — shared sign up / log in; "hire vs earn" sets the role; 18+ gate;
  Supabase Auth.

## 9. Pilot v1 vs. deferred

**Build for the pilot:** auth + roles; curated services (admin-toggled);
provider onboarding wizard + manual verification; admin approval/curation;
Stripe Connect (test mode) with charge-after-accept; browse/profile/booking/
confirm-&-pay; customer + provider dashboards; provider calendar; jobs &
pricing; profile & settings; reviews; messaging scaffold with regex moderation;
About page; Blog route (empty).

**Deferred (do not build unless asked):** flexible per-service availability
(ship a simple version first); messaging model-moderation tuning + review
dashboard; blog content/generation; in-app polish like read receipts; native
mobile; live Stripe; automated (non-manual) verification.

## 10. Open questions

- Charge flow edge cases: refunds/cancellations after `paid`; no-shows.
- Browse: filter-by-service first vs. show-all; surface unverified providers or
  hide until ID-approved.
- Public pricing: fixed vs. "request a quote" for fuzzy services (moving help).
- Messaging: allow chat pre-booking (enables image quotes, wider leakage
  surface) or only after a request exists? Block/redact/flag default.
- Availability granularity for the pilot (day toggles + hours vs. per-day).
- Admin access: all four founders, or just Zach + Ari.
- Auth: Google sign-in now or later; require email verification before booking.

---

*Reference: `wireframe.html` for visual layout. Keep this spec updated as
decisions resolve.*
