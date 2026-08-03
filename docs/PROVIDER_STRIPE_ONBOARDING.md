# Connecting Stripe — provider instructions

What we hand a student provider when they reach the **Connect Stripe** step. The
provider-facing text starts at [What to send providers](#what-to-send-providers)
and is meant to be pasted whole into Slack, an email, or a help page.

Sources: Ari's notes from a real run-through, checked against Stripe's
[required verification information](https://docs.stripe.com/connect/required-verification-information),
[connected-account onboarding](https://docs.stripe.com/connect/marketplace/tasks/onboard),
[identity verification](https://docs.stripe.com/connect/identity-verification),
[W-8/W-9 collection](https://docs.stripe.com/connect/connect-w8-w9-onboarding),
[Financial Connections for payouts](https://docs.stripe.com/financial-connections/connect-payouts),
and [first-payout timing](https://support.stripe.com/questions/delay-for-first-payout-for-connected-accounts).
Verified 2026-08-03.

---

## Why the flow looks the way it does

`apps/web/lib/stripe/connect.ts` creates an **Accounts v2 `recipient`** account —
`stripe_balance.stripe_transfers` only, `dashboard: "express"`,
`identity.country: "US"`. A recipient can receive transfers but cannot request
`card_payments`, so it carries lighter requirements than a full merchant account.

The account link passes `collection_options: { fields: "eventually_due" }`, so
Stripe collects **everything up front** in one pass instead of dribbling
requirements out as earnings grow. The session is slightly longer, but a provider
who finishes it is done.

Entry points are all on the provider dashboard, post-approval: **Connect
Stripe** → **Resume Stripe setup** / **Continue Stripe setup** → **Refresh**
(`app/(provider)/provider/dashboard/page.tsx`).

A connected Stripe account is necessary but not sufficient for a public listing —
`stripe_transfers` must be `active`, and it is one of seven conditions in the
browse exposure gate (profile photo among them).

## Open item — verify before treating this as final

Ari's notes record a "what does your business do" description screen and an
optional website field. Those are **merchant**-configuration requirements
(industry/MCC, product description, URL); a `recipient`-only account should not
be asked for them, and the screens read like the College Crew *platform* account
signup rather than a provider's connected account.

Step 6 below is written to be harmless either way. One live run through **Connect
Stripe** on a real provider account settles it — delete step 6 if the screens
never appear.

---

## What to send providers

### Before you start (5 minutes — have these ready)

- Your legal name exactly as it appears on your Social Security card
- Date of birth (you must be 18+)
- Your current US home address — your dorm or apartment is fine; no PO boxes
- The **last 4 digits of your SSN**
- Your bank's **routing and account numbers**, or your online banking login
- Your phone (you'll get a text code)
- A photo ID (driver's license or passport) nearby, in case Stripe asks

**Two rules.** The bank account must be **in your own name** — not a parent's,
not a roommate's. And always start from your College Crew dashboard, never from
a link someone texts or emails you.

### Steps

1. **Sign in to College Crew and open your Provider dashboard.** Click **Connect
   Stripe**. This only appears after your profile is approved.
2. **Wait for Stripe to load.** It can take several seconds. Don't hit back or
   refresh — the link works once. If you land back on your dashboard, just click
   **Resume Stripe setup**.
3. **Confirm your email**, then **enter your phone number** and type in the
   6-digit code Stripe texts you.
4. **Business type: choose "Individual."** If Stripe phrases it as registered vs.
   unregistered, you're **unregistered**. Only choose Company / registered
   business if you actually have an LLC and an EIN.
5. **Enter your personal details** — legal name, date of birth, home address,
   last 4 of your SSN. The name must match your Social Security card exactly; a
   nickname is the number-one reason verification fails.
6. **If Stripe asks what you do:** describe your work plainly — "household and
   yard services." **You do not need a website.** Skip it, or leave it blank if
   it's optional.
7. **Connect your bank account.** Either look up your bank and sign in, or choose
   to enter your **routing and account numbers** manually. Use a regular checking
   account. **You don't have to set up Link** — skip it if offered; it won't
   affect getting paid.
8. **If Stripe asks for a photo ID:** upload a clear, well-lit photo of your
   driver's license (front and back) and take the selfie if prompted. No glare,
   all four corners visible.
9. **Accept Stripe's agreement and submit.** You'll be sent back to your College
   Crew dashboard.
10. **Check your dashboard.** It should say Stripe is connected. If it still says
    setup is incomplete, click **Refresh** — verification is usually instant but
    can take up to a couple of business days. If Stripe needs more information,
    **Continue Stripe setup** takes you straight back to the missing piece.

### Getting paid

College Crew pays you after a job is complete — it goes to your Stripe balance,
then Stripe deposits it to your bank. The very first deposit takes about a week;
after that it's a couple of business days. You'll get a tax form from Stripe if
you earn enough in a year.

### If you're an international student

If you don't have an SSN, look for "I don't have a US SSN" or the alternative-ID
option and follow it — you'll verify with your passport instead. Tell us if you
get stuck there.

---

## Support notes (don't send these)

Common failures, in rough order of how often they bite:

- **Bank account isn't in the provider's name.** Stripe verifies account
  ownership; a parent's account fails and the payout bounces.
- **Name mismatch with the SSN record.** A nickname or a missing middle/last name
  sends the account to ID-document verification.
- **Expired account link.** Single-use, expires within minutes. A back button, a
  refresh, or a link preview in a messaging client burns it. Fix: click **Resume
  Stripe setup** again — never re-send an old URL.
- **Incomplete address.** Payouts need a validated full residential address
  within 30 days, so a partial one stalls the account later, not immediately.
- **SSN last 4 fails verification.** Stripe escalates to full 9-digit SSN plus an
  ID document. Full SSN is also required at lifetime-volume thresholds.
- **Provider connected Stripe but isn't on Browse.** Check the other six exposure
  conditions before suspecting Stripe — a missing profile photo is the usual
  cause.

Never collect SSN, bank, or ID data in a College Crew form or over Slack or
email. It goes into Stripe's hosted flow or nowhere.
