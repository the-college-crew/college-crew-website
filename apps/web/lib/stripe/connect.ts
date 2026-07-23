import "server-only";

import type Stripe from "stripe";

import type { Booking } from "@/lib/db/types";
import { getStripe } from "@/lib/stripe/server";

/**
 * Stripe Connect seams — the ONLY places payment code touches Stripe. Every
 * caller must still handle `{ configured: false }` for the case where
 * STRIPE_SECRET_KEY is absent (e.g. a fresh checkout without .env.local).
 *
 * Connected accounts use the Accounts v2 API with the marketplace recipient
 * shape: express dashboard, the platform collects fees and owns losses, and
 * the `stripe_transfers` capability so we can pay providers via destination
 * charges (SPEC §6). This deliberately supersedes the legacy v1
 * `accounts.create({ type: "express" })` pattern.
 */

export type StripeUnconfigured = { configured: false; reason: string };

const UNCONFIGURED: StripeUnconfigured = {
  configured: false,
  reason:
    "Stripe isn't configured — set STRIPE_SECRET_KEY in .env.local to enable payments.",
};

/**
 * Hosted onboarding for an APPROVED provider (SPEC §6: Stripe is connected
 * after approval, never during the wizard). Creates the v2 recipient account
 * on first run, then a single-use Account Link into Stripe-hosted onboarding.
 *
 * NOTE: `refreshUrl`/`returnUrl` MUST be HTTPS — the v2 Account Link API
 * rejects http:// even for localhost, so onboarding is exercised against the
 * deployed (preview) URL rather than the local dev server.
 */
export async function createConnectOnboardingLink(input: {
  stripeAccountId: string | null;
  /** Required on account creation — v2 rejects a recipient config without it. */
  contactEmail: string;
  refreshUrl: string;
  returnUrl: string;
}): Promise<
  { configured: true; url: string; stripeAccountId: string } | StripeUnconfigured
> {
  const stripe = getStripe();
  if (!stripe) return UNCONFIGURED;

  const accountId =
    input.stripeAccountId ??
    (
      await stripe.v2.core.accounts.create({
        contact_email: input.contactEmail,
        // Pilot is a single US neighborhood; v2 requires identity.country
        // before a recipient configuration can be set.
        identity: { country: "US" },
        dashboard: "express",
        defaults: {
          responsibilities: {
            fees_collector: "application",
            losses_collector: "application",
          },
        },
        configuration: {
          recipient: {
            capabilities: {
              stripe_balance: { stripe_transfers: { requested: true } },
            },
          },
        },
      })
    ).id;

  const link = await stripe.v2.core.accountLinks.create({
    account: accountId,
    use_case: {
      type: "account_onboarding",
      account_onboarding: {
        configurations: ["recipient"],
        refresh_url: input.refreshUrl,
        return_url: input.returnUrl,
        collection_options: { fields: "eventually_due" },
      },
    },
  });

  return { configured: true, url: link.url, stripeAccountId: accountId };
}

/**
 * Whether an onboarded provider can actually receive payouts — i.e. the
 * recipient `stripe_transfers` capability is `active`. A non-null
 * `stripe_account_id` only means onboarding was *started*; this confirms it
 * finished, so the UI can distinguish "connected" from "finish setup".
 */
export async function getProviderPayoutStatus(
  stripeAccountId: string,
): Promise<
  { configured: true; transfersActive: boolean } | StripeUnconfigured
> {
  const stripe = getStripe();
  if (!stripe) return UNCONFIGURED;

  const account = await stripe.v2.core.accounts.retrieve(stripeAccountId, {
    include: ["configuration.recipient"],
  });

  const status =
    account.configuration?.recipient?.capabilities?.stripe_balance
      ?.stripe_transfers?.status;

  return { configured: true, transfersActive: status === "active" };
}

/**
 * Charge-after-accept (SPEC §3/§6): the customer confirms an accepted
 * booking, we create a destination charge for the full price with the
 * booking's immutable fee snapshot; the remainder is the provider's payout.
 */
export async function createBookingPaymentIntent(input: {
  booking: Pick<Booking, "id" | "price_cents" | "platform_fee_cents">;
  providerStripeAccountId: string;
}): Promise<{ configured: true; clientSecret: string } | StripeUnconfigured> {
  const stripe = getStripe();
  if (!stripe) return UNCONFIGURED;

  const intent = await stripe.paymentIntents.create(
    {
      amount: input.booking.price_cents,
      currency: "usd",
      application_fee_amount: input.booking.platform_fee_cents,
      transfer_data: { destination: input.providerStripeAccountId },
      metadata: { booking_id: input.booking.id },
      automatic_payment_methods: { enabled: true },
    },
    { idempotencyKey: `booking:${input.booking.id}:full-payment` },
  );

  if (!intent.client_secret) return UNCONFIGURED;
  return { configured: true, clientSecret: intent.client_secret };
}

/**
 * Hourly Booking v1 (Phase 4): the customer pays exactly one hourly-rate amount
 * as the first-hour payment. Destination charge with the booking's 5% first-hour
 * application fee; `setup_future_usage: "off_session"` saves the method to the
 * platform Customer for THIS booking's later balance charge (Phase 5).
 *
 * The idempotency key is derived from the booking, so a refresh/double-submit
 * returns the same PaymentIntent instead of creating a second charge. Dynamic
 * payment methods are enabled (no `payment_method_types`).
 */
export async function createFirstHourPaymentIntent(input: {
  bookingId: string;
  amountCents: number;
  applicationFeeCents: number;
  stripeCustomerId: string;
  providerStripeAccountId: string;
  idempotencyKey: string;
}): Promise<
  | { configured: true; paymentIntentId: string; clientSecret: string }
  | StripeUnconfigured
> {
  const stripe = getStripe();
  if (!stripe) return UNCONFIGURED;

  const intent = await stripe.paymentIntents.create(
    {
      amount: input.amountCents,
      currency: "usd",
      customer: input.stripeCustomerId,
      application_fee_amount: input.applicationFeeCents,
      transfer_data: { destination: input.providerStripeAccountId },
      metadata: { booking_id: input.bookingId, payment_kind: "first_hour" },
      // Instant-book: the first hour is AUTHORIZED at request time and captured
      // only when the provider accepts (released, never charged, on
      // decline/timeout). Manual capture turns the confirmed intent into a hold.
      capture_method: "manual",
      setup_future_usage: "off_session",
      automatic_payment_methods: { enabled: true },
    },
    { idempotencyKey: input.idempotencyKey },
  );

  if (!intent.client_secret) return UNCONFIGURED;
  return {
    configured: true,
    paymentIntentId: intent.id,
    clientSecret: intent.client_secret,
  };
}

/**
 * Capture a first-hour authorization when the provider accepts. Turns the hold
 * into an actual charge; the `payment_intent.succeeded` webhook then advances
 * the booking accepted → booked. Idempotent via the passed key.
 */
export async function captureFirstHourPayment(input: {
  paymentIntentId: string;
  idempotencyKey: string;
}): Promise<
  { configured: true; status: Stripe.PaymentIntent.Status } | StripeUnconfigured
> {
  const stripe = getStripe();
  if (!stripe) return UNCONFIGURED;

  const intent = await stripe.paymentIntents.capture(
    input.paymentIntentId,
    {},
    { idempotencyKey: input.idempotencyKey },
  );
  return { configured: true, status: intent.status };
}

/**
 * Release a first-hour authorization on decline or a lapsed response window.
 * Cancelling a still-held intent drops the hold with no charge and no refund —
 * the customer's money never left. Safe to call on an already
 * cancelled/captured intent: we re-read and report the live state.
 */
export async function cancelFirstHourAuthorization(input: {
  paymentIntentId: string;
}): Promise<
  { configured: true; status: Stripe.PaymentIntent.Status } | StripeUnconfigured
> {
  const stripe = getStripe();
  if (!stripe) return UNCONFIGURED;

  try {
    const intent = await stripe.paymentIntents.cancel(input.paymentIntentId);
    return { configured: true, status: intent.status };
  } catch {
    const current = await stripe.paymentIntents.retrieve(input.paymentIntentId);
    return { configured: true, status: current.status };
  }
}

/**
 * Hourly Booking v1 (Phase 5): the remaining-balance charge on the same booking.
 * A destination charge for the invoice's remaining balance with the split
 * application fee (total fee minus the first-hour fee, so rounding never
 * drifts).
 *
 * Always returns an UNCONFIRMED PaymentIntent. Callers must attach its id to
 * the payment row BEFORE confirming (`confirmBalancePaymentIntent` for the
 * saved-method flows; the Payment Element for recovery) — confirming first
 * races the `payment_intent.succeeded` webhook, and if the webhook wins there
 * is no attached row to settle and the invoice strands in review.
 *
 * Pass `stripePaymentMethodId` to stage the saved method on the intent;
 * omit it in recovery so the Payment Element can collect/re-authenticate one.
 * `payment_method_types` is omitted (dynamic methods); redirects are disabled
 * so the pilot never leaves the app. The webhook is the settlement source of
 * truth — this only creates the intent.
 */
export async function createBalancePaymentIntent(input: {
  invoiceId: string;
  bookingId: string;
  amountCents: number;
  applicationFeeCents: number;
  stripeCustomerId: string;
  providerStripeAccountId: string;
  idempotencyKey: string;
  stripePaymentMethodId?: string;
}): Promise<
  | {
      configured: true;
      paymentIntentId: string;
      clientSecret: string | null;
      status: Stripe.PaymentIntent.Status;
    }
  | StripeUnconfigured
> {
  const stripe = getStripe();
  if (!stripe) return UNCONFIGURED;

  const params: Stripe.PaymentIntentCreateParams = {
    amount: input.amountCents,
    currency: "usd",
    customer: input.stripeCustomerId,
    application_fee_amount: input.applicationFeeCents,
    transfer_data: { destination: input.providerStripeAccountId },
    metadata: {
      booking_id: input.bookingId,
      invoice_id: input.invoiceId,
      payment_kind: "balance",
    },
    automatic_payment_methods: { enabled: true, allow_redirects: "never" },
  };
  if (input.stripePaymentMethodId) {
    params.payment_method = input.stripePaymentMethodId;
  }

  const intent = await stripe.paymentIntents.create(params, {
    idempotencyKey: input.idempotencyKey,
  });
  return {
    configured: true,
    paymentIntentId: intent.id,
    clientSecret: intent.client_secret,
    status: intent.status,
  };
}

/**
 * Confirm a balance PaymentIntent whose id is already attached to its payment
 * row (see `createBalancePaymentIntent`). `offSession: false` is the customer
 * present ("Confirm & pay now"); `offSession: true` is the scheduled
 * autocharge on the saved method.
 *
 * Stripe throws on a hard decline / off-session authentication requirement
 * with the PaymentIntent attached; we surface it so the caller records the
 * outcome. A retry against an already-confirmed intent throws without one —
 * re-read the intent so retries after a crash stay idempotent.
 */
export async function confirmBalancePaymentIntent(input: {
  paymentIntentId: string;
  offSession: boolean;
}): Promise<
  | {
      configured: true;
      paymentIntentId: string;
      clientSecret: string | null;
      status: Stripe.PaymentIntent.Status;
    }
  | StripeUnconfigured
> {
  const stripe = getStripe();
  if (!stripe) return UNCONFIGURED;

  try {
    const intent = await stripe.paymentIntents.confirm(input.paymentIntentId, {
      off_session: input.offSession,
    });
    return {
      configured: true,
      paymentIntentId: intent.id,
      clientSecret: intent.client_secret,
      status: intent.status,
    };
  } catch (error) {
    const pi =
      error && typeof error === "object" && "payment_intent" in error
        ? ((error as { payment_intent?: Stripe.PaymentIntent }).payment_intent ??
          null)
        : null;
    if (pi) {
      return {
        configured: true,
        paymentIntentId: pi.id,
        clientSecret: pi.client_secret,
        status: pi.status,
      };
    }
    // e.g. "already succeeded" on a retried confirm — report the live state.
    const current = await stripe.paymentIntents.retrieve(input.paymentIntentId);
    return {
      configured: true,
      paymentIntentId: current.id,
      clientSecret: current.client_secret,
      status: current.status,
    };
  }
}

/**
 * Full refund of a first-hour destination charge with the transfer and
 * application fee reversed, so a late/terminal success returns the customer's
 * money and claws back the provider transfer. Idempotent via the passed key.
 */
export async function refundFirstHourFull(input: {
  paymentIntentId: string;
  idempotencyKey: string;
}): Promise<
  { configured: true; refundId: string; amountCents: number } | StripeUnconfigured
> {
  const stripe = getStripe();
  if (!stripe) return UNCONFIGURED;

  const refund = await stripe.refunds.create(
    {
      payment_intent: input.paymentIntentId,
      reverse_transfer: true,
      refund_application_fee: true,
    },
    { idempotencyKey: input.idempotencyKey },
  );

  return { configured: true, refundId: refund.id, amountCents: refund.amount };
}

/**
 * Hourly Booking v1 (Phase 6): refund any destination charge — first-hour or
 * balance, full or partial. Omit `amountCents` for a full refund. Always
 * reverses the provider transfer and refunds the application fee; on a partial
 * refund Stripe reverses/refunds *proportionally*, so the provider loses their
 * 95% share of the reduction and the platform its 5% — the split never drifts.
 *
 * Used by cancellations (full first-hour refund), founder cancel_and_refund
 * (full first-hour + balance), and reduce_billable_minutes (partial balance).
 * The webhook + `settle_booking_refund`/`reconcile_stripe_refund` remain the
 * ledger source of truth; this only executes the Stripe side. Idempotent via
 * the passed key.
 */
export async function refundDestinationCharge(input: {
  paymentIntentId: string;
  amountCents?: number;
  idempotencyKey: string;
}): Promise<
  | {
      configured: true;
      refundId: string;
      amountCents: number;
      transferReversalId: string | null;
    }
  | StripeUnconfigured
> {
  const stripe = getStripe();
  if (!stripe) return UNCONFIGURED;

  const params: Stripe.RefundCreateParams = {
    payment_intent: input.paymentIntentId,
    reverse_transfer: true,
    refund_application_fee: true,
  };
  if (typeof input.amountCents === "number") {
    params.amount = input.amountCents;
  }

  const refund = await stripe.refunds.create(params, {
    idempotencyKey: input.idempotencyKey,
  });

  const transferReversalId =
    typeof refund.transfer_reversal === "string"
      ? refund.transfer_reversal
      : (refund.transfer_reversal?.id ?? null);

  return {
    configured: true,
    refundId: refund.id,
    amountCents: refund.amount,
    transferReversalId,
  };
}
