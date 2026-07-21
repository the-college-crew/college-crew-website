# Booking Flow — Hardening & Patch Plan

**Date:** 2026-07-20
**Owner:** Ari
**Source:** 4-way parallel audit of the booking flow (lifecycle, payments, communication/meetup, data/RLS). See the audit synthesis in session history.
**Status:** Planned — decisions locked with Ari, not yet implemented.

---

## 0. Context & headline

The engineering foundation is strong: **no critical/high security findings, no open endpoints, no cross-tenant reads, no double-charge holes.** Money math (integer cents, DB-authoritative, idempotent, signature-verified), auth, and the state machine are defense-in-depth.

The damage is concentrated in the **human/meetup layer** — two strangers meeting at a private home — plus a handful of edge-case money/lifecycle gaps. The single highest-impact item is a plain code bug (times displayed in the wrong timezone on every surface).

### Verification results (done during planning)
| Suspected item | Result |
|---|---|
| Prod scheduler wired? (Vault `booking_scheduler_url` + `booking_cron_secret`, cron job) | **CLEARED.** Both Vault secrets present; cron job `hourly-booking-v1-scheduler` runs `* * * * *` (every minute). Automation/emails/expiry/autocharge do run in prod. (One-time confirm edge-function logs show invocations.) |
| Realtime `setAuth()` authenticates? | **Still verify at runtime.** `chat-thread.tsx:57` calls `client.realtime.setAuth()` with no arg. Fix is version-agnostic regardless (pass the token explicitly) — folded into Phase 0. |

---

## 1. Decisions locked with Ari

| # | Topic | Decision |
|---|---|---|
| Timezone | Scope | **Hardcode Central (America/Chicago)** everywhere — matches pilot single-region. |
| Notifications | Channel | **Email now** (Resend is live); wire `send-push` later when mobile ships. |
| Notifications | Events | Provider **arrived** → customer; **new request** → provider; **status changes** (accepted/declined/expired/payment-due) → customer; **new chat message → email, only after the booking is confirmed** (not pre-booking inquiries). |
| Contact | Fallback | **Reveal phone after booking** — optional phone field, shown only to the matched party once booked; stop flag-reporting numbers exchanged inside a booked thread. |
| Provider unpaid tail (#7) | Policy | **Accept risk, harden recovery** — keep first-hour-upfront; improve retry/dunning + notify both parties on failure; document exposure. |
| Address (#6) | Privacy | **Town/approx until accepted** — neighborhood + distance on pending requests; full address only after accept. |
| Navigation (#5) | Scope | **Map/navigate link + provider "on my way"/ETA** to customer. |
| Payout check (#8) | Approach | **Re-check `transfers_active` at charge time + surface a clear, actionable error** (re-sync snapshot). |
| Late accept (#11) | Fix | **Both** — block acceptance when job starts in < 2h; otherwise guarantee a minimum pay window. |
| Ghosting (#12) | Fix | **Add response-deadline auto-expiry** (12h after request, capped at start). |
| Disputes (#13) | Fix | **Alert-only + escalation reminders** (every 24h); no auto-resolution. |
| Multi-request (#15) | Fix | **Prevent cross-provider double-book only** — allow shopping multiple providers; block confirming a second request overlapping an already-accepted one. |
| Money edges (#9, #10) | Scope | **Fix both now** — balance-charge `refund_owed` reversal path + per-refund amount on `charge.refunded`. |
| Hardening | Scope | **All four**: revoke legacy cancel RPC; `send-push` `verify_jwt=false` in config.toml; GIST double-book exclusion constraint; revoke anon EXECUTE on legacy predicates + enable leaked-password protection. |

### Timing thresholds (Balanced profile — all tunable)
- Minimum pay window: **45 min**
- Block accept when job starts in: **< 2h**
- Ghosting auto-expiry: **12h after request** (capped at scheduled start)
- Dispute reminder cadence: **every 24h**

---

## 2. Workstreams

Each item: **Problem → Approach → Files → DB? → Effort/Risk → Acceptance.**
Effort = S (<½ day) / M (~1 day) / L (multi-day). Risk = money/data blast radius.

### Phase 0 — Quick wins (no product change, low risk)

**P0.1 — Timezone display (#1)** · Effort S · Risk Low
- Problem: `formatDateTime`/`formatTime` (and `formatDate`) in `apps/web/lib/utils.ts` pass no `timeZone`, so server components render in UTC (~5-6h off). Chat's client-side `formatTime` vs server-side header = two clocks on one screen.
- Approach: add a single `const APP_TIME_ZONE = "America/Chicago"` in `utils.ts` and pass `timeZone: APP_TIME_ZONE` to all three `Intl.DateTimeFormat` formatters. Centralized — every one of the ~20 caller files inherits the fix. Verify the demo formatters (`demo-chat-thread.tsx`, `bookings/demo/*`) and `month-calendar.tsx` too.
- Files: `apps/web/lib/utils.ts` (primary). Audit callers for any local `Intl.DateTimeFormat`/`toLocaleString` that bypass the helpers.
- DB: none.
- Acceptance: a 3:00 PM Central booking shows "3:00 PM" on provider dashboard, provider jobs, customer dashboard, and the message-thread header; chat bubble time matches the header.

**P0.2 — Realtime auth token (#2 suspected)** · Effort S · Risk Low
- Problem: `client.realtime.setAuth()` with no arg may not pick up the session JWT depending on supabase-js version; if it doesn't, live delivery silently fails and this makes the notification gap total.
- Approach: fetch the session and pass the token explicitly — `const { data } = await client.auth.getSession(); await client.realtime.setAuth(data.session?.access_token ?? null);` (version-agnostic). Add a dev-time console guard if no token.
- Files: `apps/web/components/chat/chat-thread.tsx:52-58`.
- DB: none.
- Acceptance: message sent from account A appears live (no reload) in account B's open thread.

**P0.3 — `send-push` verify_jwt in config.toml** · Effort S · Risk Low
- Problem: `verify_jwt=false` set via deploy flag only; a config-driven redeploy would flip to `true` and silently break the DB-webhook caller (secret gate still stands, so not a security hole).
- Approach: add `[functions.send-push]\nverify_jwt = false` to `supabase/config.toml` alongside the existing `stripe-webhook`/`booking-scheduler` entries.
- Files: `supabase/config.toml`.
- Acceptance: config.toml records the flag; redeploy from config keeps the secret-gated open path.

**P0.4 — Predicate EXECUTE + leaked-password hardening** · **DROPPED (Ari, 2026-07-21)**
- Problem (as planned): 9 legacy `SECURITY DEFINER` predicate fns retain PUBLIC/anon EXECUTE; HaveIBeenPwned leaked-password protection disabled.
- **Why dropped:** verified against live policies (`pg_policies`) — 5 of these fns (`is_admin`, `owns_provider_profile`, `is_conversation_member`, `shares_thread_with`, `is_provider_approved`) are referenced by RLS policies, including **`{anon,authenticated}` policies for public browse** (`provider_profiles`, `provider_services`, `provider_availability_windows`). Postgres requires the evaluating role to hold EXECUTE on any function a policy calls, so `revoke ... from anon, public` would throw `permission denied for function` and break public browse + authenticated reads. The audit's "low impact" was about return values, not execute-permission. Real security gain is ~zero anyway (all are `auth.uid()`-gated, anon → false). Ari chose to **skip the revoke entirely**.
- **Leaked-password protection:** it's an Auth dashboard toggle (not code/MCP). **Deferred for the pilot** (test-mode, low priority).
- Net: no migration, no Auth change. Recorded here for the audit trail.

### Phase 1 — Email notifications (Resend)

**P1 — Coordination emails** · Effort M · Risk Low-Med
- Problem: no notification exists for messages or arrival; recipients must stare at a browser tab. Only founder-flag emails fire today.
- Approach: reuse the existing email pipeline (`apps/web/lib/email/*`, `email_outbox`, Resend, `booking-scheduler/email.ts`). Add/extend triggers for:
  1. **New chat message → recipient email**, gated to conversations whose booking is **confirmed** (booked/in_progress/invoice_review). Debounce (e.g. one email per thread per N min while unread) to avoid a message-per-email storm. Emit from `moderate-message` (after successful insert) or a DB trigger enqueue to `email_outbox`.
  2. **Provider arrived → customer email** ("your provider is here"). Emit from `mark_booking_arrived`.
  3. **New request → provider** — confirm the existing `email_outbox` enqueue (`20260715173857`) actually drains via the (now-verified-live) scheduler; add if missing.
  4. **Status changes → customer** — accepted / declined / expired / payment-due. Emit from the respective RPCs / scheduler jobs.
- Files: `apps/web/lib/email/booking.ts`, `supabase/functions/booking-scheduler/email.ts`, `supabase/functions/moderate-message/index.ts`, relevant lifecycle RPC migrations, `docs/EMAIL_TEMPLATES.md`.
- DB: likely new `email_outbox` enqueue rows / trigger points; migration.
- Acceptance: each event produces exactly one email to the correct (non-founder) recipient; message emails only fire post-confirmation and are debounced.

### Phase 2 — Meetup UX

**P2.1 — Reveal phone after booking (#3)** · Effort M · Risk Med (PII)
- Problem: no phone field; moderation flags legitimate day-of numbers; chat is the only channel.
- Approach: add optional `phone` to the profile (customer + provider). Expose each party's phone to the *other* party **only when a shared booking is confirmed**, via a scoped view/RPC with column grants (heed the project's "view columns need explicit browser grants" history — grant deliberately, test public browse doesn't leak). Relax `moderate-message` so numbers exchanged **inside a confirmed booked thread** are not flag-reported (keep flagging on pre-booking inquiry threads).
- Files: migration (schema + RLS/grants + reveal RPC/view); `supabase/functions/moderate-message/index.ts` (context-aware policy); booking detail UI to surface the number.
- DB: yes — schema + RLS + grants. **Review carefully** (PII exposure surface).
- Acceptance: matched parties see each other's phone only after confirmation; non-parties never do; public browse unaffected; in-thread numbers post-booking no longer founder-flagged.

**P2.2 — Map link + on-my-way/ETA (#4, #5)** · Effort M · Risk Low
- Problem: address is plain text (coords exist but unused); no arrival signal to customer.
- Approach: (a) render a maps/navigate link from stored address/coords on the provider job view; (b) add a provider **"on my way"** action → notifies customer (email now, push later) with an optional ETA; (c) surface **provider arrived** to the customer as an in-app event + email (ties to P1.2).
- Files: `apps/web/app/(provider)/provider/jobs/page.tsx`, provider `actions.ts` (`markArrived` + new `markOnMyWay`), customer dashboard, email templates. Possibly a lightweight `booking_events` enqueue.
- DB: small — new action/status side-channel or reuse audit events; migration if a new column/event type.
- Acceptance: provider gets a working navigate link; customer receives "on my way (ETA)" and "arrived" notifications.

**P2.3 — Town/approx address until accepted (#6)** · Effort S-M · Risk Low
- Problem: full street address shown to provider at `requested` (harvestable).
- Approach: on pending (`requested`) requests, show neighborhood/town + already-computed distance only; reveal full address at `accepted`. Enforce at the data layer (don't just hide in UI) — restrict the address column in the requests read path until status ≥ accepted.
- Files: provider dashboard request rendering (`(provider)/provider/dashboard/page.tsx`), the query/RPC feeding it, possibly RLS/view.
- DB: maybe (if enforced via view/RPC). Prefer server-enforced over UI-only.
- Acceptance: a `requested` row exposes no exact street address to the provider; full address appears on accept.

### Phase 3 — Money hardening

**P3.1 — Payout re-check at charge (#8)** · Effort S-M · Risk Med
- Approach: in `begin_first_hour_payment` / `create-payment-sheet` (and balance path), re-check `stripe_transfers_active` (re-sync snapshot via `syncProviderPayoutSnapshot` if stale) before creating the destination-charge PI; on not-payable, return a specific, actionable error instead of the generic catch, and don't strand a `created` payment row.
- Files: `supabase/functions/create-payment-sheet/index.ts`, migration `20260714001809_hourly_first_hour_payment.sql` RPC, `apps/web/lib/stripe/connect.ts`.
- DB: yes (RPC change).
- Acceptance: a restricted-account charge fails with a clear message; no orphan `created` payment row.

**P3.2 — Balance `refund_owed` reversal (#9)** · Effort M · Risk Med
- Approach: mirror the first-hour `refund_owed` path in `settle_balance_payment` — if the booking left `invoice_review` after the PI was created, auto-reverse (refund + reverse transfer + refund app fee) instead of `settled_no_transition` stranding captured money.
- Files: migration `20260714133643_hourly_work_invoicing.sql` (`settle_balance_payment`), webhook settle handler, `reconcile-payment`.
- DB: yes.
- Acceptance: create→dispute/cancel→settle race auto-refunds; no captured-but-stranded balance.

**P3.3 — `charge.refunded` per-refund amount (#10)** · Effort S · Risk Low
- Approach: pass the individual refund amount (from the refund object / `event.data.object` latest refund), not cumulative `charge.amount_refunded`, into `reconcile_stripe_refund` on both webhook routes. Read `reconcile_stripe_refund` to confirm expected semantics first.
- Files: `supabase/functions/stripe-webhook/index.ts:220`, `apps/web/app/api/webhooks/stripe/route.ts:193`, the RPC.
- DB: maybe.
- Acceptance: two partial refunds on one charge record correct individual amounts.

**P3.4 — Harden provider-unpaid recovery (#7)** · Effort M · Risk Med
- Approach (policy = accept risk): keep first-hour-upfront; on balance charge failure, ensure dunning retries run (already partly in `attemptDueInvoiceCharge`), and **notify both parties** (provider: "payment pending, we're retrying"; customer: "your card failed, please update"). Document the tail exposure in provider-facing terms.
- Files: `supabase/functions/booking-scheduler/invoicing.ts`, email templates, provider/customer UI copy.
- DB: minimal.
- Acceptance: a failed balance charge produces retries + clear notifications to both sides; exposure documented.

### Phase 4 — Lifecycle guardrails (DB-heavy)

**P4.1 — Late-accept: block <2h + min 45-min pay window (#11)** · Effort M · Risk Med
- Approach: in `accept_booking_request`, reject acceptance when `scheduled_at - now() < interval '2 hours'` (clear provider-facing message). Otherwise set `initial_payment_due_at = greatest(now() + interval '45 min', existing least(...))` so the window never collapses. Adjust `payment_expiration` scheduling to match.
- Files: `20260713221827_hourly_request_lifecycle.sql` (accept RPC), `apps/web/lib/booking/policy.ts` (`deriveInitialPaymentDueAt`), automation migration.
- DB: yes.
- Acceptance: accept fails politely inside 2h; when allowed, customer always gets ≥45 min to pay.

**P4.2 — Ghosting auto-expiry 12h (#12)** · Effort M · Risk Med
- Approach: add an automation job that expires `requested` rows at `least(created_at + 12h, scheduled_at)` when no provider response; notify the customer + surface replace. Add `response_deadline_at` column + scheduler enqueue.
- Files: automation migration (`20260715173857_*` sibling), `booking-scheduler/automation.ts`, email templates.
- DB: yes.
- Acceptance: an ignored request auto-expires by the deadline with a customer notification.

**P4.3 — Dispute escalation reminders every 24h (#13)** · Effort S-M · Risk Low
- Approach: alert-only. Scheduler job re-alerts founders every 24h while a booking is `disputed` and past `dispute_due_at`; add a visible SLA. No auto-resolution.
- Files: `booking-scheduler/automation.ts` + admin surface, email templates.
- DB: minimal (track last-reminder timestamp).
- Acceptance: an unresolved dispute pings founders on a 24h cadence.

**P4.4 — Prevent cross-provider double-book at confirm (#15)** · Effort M · Risk Med
- Approach: allow multiple pending requests, but in the first-hour payment/confirm path, block confirming a request that overlaps a booking the **customer** already has `accepted`/`booked`/`in_progress` (currently the conflict check is per-provider only). Add a customer-side overlap check under the same advisory-lock discipline.
- Files: `20260714001809_hourly_first_hour_payment.sql` (`begin_first_hour_payment`), conflict predicate.
- DB: yes.
- Acceptance: a customer cannot confirm two overlapping bookings across different providers.

**P4.5 — Revoke legacy cancel RPC for hourly (#14)** · Effort S · Risk Low
- Approach: guard `cancel_booking_request` to reject hourly rows (or revoke from `authenticated`), forcing hourly cancels through `cancel_booking_as_customer` (which refunds a captured first hour). UI already routes correctly; this closes the direct-RPC hole.
- Files: migration touching `20260713221827_*` RPC grants.
- DB: yes.
- Acceptance: a direct `cancel_booking_request` on an hourly booking with a captured first hour is rejected or refunds correctly.

**P4.6 — GIST double-book exclusion constraint** · Effort M · Risk Med (backfill)
- Approach: add a `tstzrange` GIST exclusion constraint on provider + time range for reserved statuses as a hard backstop behind the procedural advisory-lock prevention. Validate against existing data before enforcing (guard against a failed migration on legacy overlaps).
- Files: new migration.
- DB: yes — **test on a branch first** (constraint could reject existing rows).
- Acceptance: DB physically rejects an overlapping reserved booking for the same provider.

---

## 3. Suggested sequencing

1. **Phase 0** — ✅ **DONE 2026-07-21** (branch `feat/booking-hardening-phase0`, commit `5b68a06`): P0.1 timezone, P0.2 realtime token, P0.3 send-push config. P0.4 dropped (see above). Salvages the meetup clock + realtime.
2. **Phase 1** email notifications — highest experience payoff after the clock fix.
3. **Phase 2** meetup UX (phone reveal, map/ETA, address privacy) — builds on Phase 1's email plumbing.
4. **Phase 3** money hardening — independent; can run in parallel with 2.
5. **Phase 4** lifecycle guardrails — most DB migrations; do after the above and test each on a Supabase branch (esp. P4.6).

**Cross-cutting:** every DB change goes through a migration tested on a branch before merge (per project workflow); watch the shared-working-tree / migrations-outpace-branch hazards noted in project memory — rebase before applying.

## 4. Cleared / no action
- Prod scheduler automation (Vault + cron) — confirmed live.
- Core security posture (RLS, endpoint auth, webhook idempotency/signatures, fee-split math, double-accept race safety, append-only audit trail, FK integrity) — verified solid; no changes.

## 5. Open follow-ups (not scheduled)
- One-time: confirm `booking-scheduler` edge-function logs show per-minute invocations (not just cron firing).
- Message thread 200-cap has no pagination (cosmetic; backlog).
- Optimistic-send dedupe can collapse two identical messages (cosmetic; backlog).
- Pre-booking inquiry chat is ungated (logged-in, not email-confirmed) and flag-only — abuse/spam vector; revisit if inquiry spam appears.
