# College Crew production launch runbook

This is the authoritative cutover sequence. Do not swap only some Stripe
credentials, do not delete production test data before the backup checkpoint,
and do not invite providers to reconnect until live onboarding has passed its
smoke test.

## Non-negotiable data boundary

Preserve every Auth user, `profiles` row, `provider_profiles` row, provider
service, availability row, profile photo, identity document, and account-level
legal acceptance. The launch reset removes only test booking/review data,
booking-linked operational and financial records, booking-linked media, Stripe
webhook test receipts, customer sandbox mappings, and provider sandbox account
IDs.

For legal acceptances, delete only rows where `booking_id is not null`.
Account-level platform/provider/customer acceptances remain immutable evidence.
The 2026-07-29 platform agreement is a new version, so the application requires
re-acceptance before the next protected action.

## Phase 1 — safe code deployment while Stripe remains in test mode

1. Deploy code and migrations that:
   - permanently enforce normal booking timing;
   - accept either a matching test-key pair or matching live-key pair;
   - require an active, checked Stripe transfer capability for Browse,
     provider profiles, booking, replacement results, and the sitemap;
   - support Accounts v2 thin events;
   - publish `robots.txt`, canonical metadata, and the dynamic sitemap;
   - publish the 2026-07-29 platform agreement.
2. Keep the existing Stripe sandbox credentials in Vercel and Supabase during
   this deployment.
3. Confirm `/robots.txt`, `/sitemap.xml`, Browse, provider dashboard, login,
   and the Stripe webhook route are healthy.

Abort: roll back the Vercel deployment and do not continue to the data reset.

## Phase 2 — backup and test-data reset

1. Pause new booking requests with `BOOKING_REQUESTS_ENABLED=false`.
2. Record baseline counts for users, profiles, provider profiles, services,
   provider offerings, availability, and account-level legal acceptances.
3. Create a private logical database dump and separately archive every
   booking-linked Storage object. Supabase database backups contain Storage
   metadata, not the stored files themselves.
4. Verify the dump is non-empty, hash it, and verify the media archive count
   matches the database manifest.
5. In one transaction, remove booking/review and booking-linked dependent
   records in foreign-key-safe order. Delete booking-scoped legal acceptances
   only.
6. Delete booking-linked `job-photos` and chat attachments from Storage.
7. Clear sandbox mappings without deleting providers:
   - set every provider's `stripe_account_id` and
     `stripe_transfers_checked_at` to null;
   - set every provider's `stripe_transfers_active` to false;
   - delete sandbox customer mappings and test webhook receipts.
8. Verify:
   - bookings, reviews, invoices, payments, payouts, refunds, disputes,
     booking conversations/messages, booking automation, booking email outbox,
     and booking-scoped legal rows are zero;
   - Browse and the provider sitemap are empty;
   - all baseline account/profile/provider/offering/availability counts are
     unchanged;
   - account-level legal acceptances are unchanged.

Abort: keep requests paused and restore from the verified logical backup. Do
not switch Stripe to live mode.

## Phase 3 — Stripe live configuration

Complete Stripe account activation first: public business details, support
contact, statement descriptor, live bank account, business representatives,
and two-step authentication.

In Stripe Workbench, with test mode off:

1. Create a least-privilege live restricted server key if the Accounts v2,
   PaymentIntent, Customer, Refund, Transfer, Dispute, Account Link, and event
   operations used by the integration can all be granted. Otherwise use the
   live secret key temporarily and replace it with a verified restricted key.
2. Copy the live publishable key (`pk_live_…`) and the one-time live server key
   (`rk_live_…` or `sk_live_…`) into the secret manager. Never paste them into
   the repository, tickets, chat, or this runbook.
3. Create the live snapshot-event destination:
   - URL: `https://www.thecollegecrew.com/api/webhooks/stripe`
   - account events required by the application:
     `payment_intent.succeeded`, `payment_intent.payment_failed`,
     `payment_intent.canceled`, `charge.refunded`,
     `charge.dispute.created`, `charge.dispute.updated`, and
     `charge.dispute.closed`.
4. Create a live **Connected accounts / Thin** destination to the same URL for:
   - `v2.core.account.closed`
   - `v2.core.account.updated`
   - `v2.core.account[configuration.recipient].capability_status_updated`
   - `v2.core.account[configuration.recipient].updated`
   - `v2.core.account[future_requirements].updated`
   - `v2.core.account[requirements].updated`
5. Stripe gives each destination its own signing secret. Store the snapshot
   destination secret as `STRIPE_WEBHOOK_SECRET` and the Connected accounts /
   Thin destination secret as `STRIPE_CONNECT_WEBHOOK_SECRET`. Never overwrite
   one with the other.
6. Update these Vercel Production variables together:
   - `STRIPE_SECRET_KEY`
   - `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
   - `STRIPE_WEBHOOK_SECRET`
   - `STRIPE_CONNECT_WEBHOOK_SECRET`
7. Update the Supabase Edge Function secret `STRIPE_SECRET_KEY` for
   `booking-scheduler` in the same maintenance window. This is a separate
   secret surface from Vercel.
8. Redeploy the web application and the scheduler function as needed, then
   verify environment validation and webhook signature delivery.

Abort: restore the complete previous sandbox credential set on both Vercel and
Supabase. Never leave one surface live and the other in test mode.

## Phase 4 — live smoke test

1. Keep public booking requests paused.
2. Use founder-controlled real accounts and a real provider bank account.
3. Complete live provider onboarding and confirm:
   - the transfer capability is active;
   - the provider appears in Browse and the sitemap;
   - disabling the capability removes the listing after the webhook refresh.
4. Enable booking requests briefly and complete one low-value real booking
   through payment, webhook settlement, invoice, provider transfer, refund,
   email delivery, and dispute-notification paths as practical.
5. Expect Stripe processing fees on the real transaction/refund.
6. Tag the smoke booking in the launch log, then remove its database and
   Storage residue with the same scoped reset procedure. Confirm all financial
   dashboard totals return to zero.

Abort: set `BOOKING_REQUESTS_ENABLED=false`, keep providers informed, and
investigate before inviting the provider cohort.

## Phase 5 — provider wave and public launch

1. Email existing real providers only after the live onboarding link works:
   “Reconnect your bank account through Stripe to appear in Browse and receive
   payouts.” The dashboard shows the same requirement.
2. Providers re-accept the current Platform Terms and finish Stripe-hosted
   onboarding from the final provider setup step, dashboard, or Payouts
   settings. They may do this while founder review is pending. Their public
   listing appears only after founder approval and the recipient transfer
   capability are both active.
3. Re-enable `BOOKING_REQUESTS_ENABLED=true`.
4. Submit the sitemap to Google Search Console and monitor Vercel, Supabase,
   Resend, Stripe event deliveries, failed automation jobs, and founder
   operations email during launch.

## Tax and dispute operations

- Before the first provider earns money, College Crew must choose its 1099
  filing owner and Stripe Tax Reporting calculation method with a qualified tax
  professional. Separate charges and transfers are derived from transfers for
  Stripe's calculation, and non-Stripe payments require manual adjustment.
  Configure Stripe Express tax-information collection and delivery rather than
  waiting until a provider reaches a reporting threshold.
- College Crew's indirect-charge model places Stripe fees, refunds, negative
  balances, and chargebacks on the platform. A founder must monitor
  `charge.dispute.created` email/webhook alerts daily, open the Stripe deadline,
  and assemble the booking agreement, payment authorization, messages,
  scheduled/arrival/completion timestamps, invoice, job photos, cancellation
  record, and customer/provider communications. Stripe response windows vary by
  network and are commonly 7–21 days; the Dashboard deadline controls.

## Email and abuse checklist

- Resend domain authentication (SPF/DKIM/DMARC), suppression status,
  `EMAIL_FROM`, and `FOUNDER_OPERATIONS_EMAILS` must pass immediately before
  launch.
- Enable Supabase Auth CAPTCHA and review Auth rate limits before indexing.
- Keep public support mutations behind bot/rate controls and monitor Vercel's
  firewall/bot protection. Payment and quote mutations remain authenticated and
  database-policy constrained.

## Source references

- Stripe go-live checklist:
  https://docs.stripe.com/get-started/checklist/go-live
- Stripe API keys and live-mode switch:
  https://docs.stripe.com/keys
- Stripe Accounts v2 event destinations:
  https://docs.stripe.com/connect/accounts-v2/migrate-integration
- Stripe Connect charge ownership:
  https://docs.stripe.com/connect/charges
- Stripe 1099 calculation methods:
  https://docs.stripe.com/connect/calculation-methods
- Stripe dispute response:
  https://docs.stripe.com/disputes/responding
- Supabase backups:
  https://supabase.com/docs/guides/platform/backups
