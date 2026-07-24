import Stripe from "npm:stripe@22";

/**
 * The slice of apps/web/lib/stripe/{server,connect}.ts the scheduler needs:
 * the balance-charge create/confirm pair used by the invoice autocharge.
 * Same graceful degradation: null/`configured: false` when STRIPE_SECRET_KEY
 * is absent. TEST MODE ONLY during the pilot.
 */

export type StripeUnconfigured = { configured: false; reason: string };

const UNCONFIGURED: StripeUnconfigured = {
  configured: false,
  reason: "Stripe isn't configured — set the STRIPE_SECRET_KEY function secret.",
};

export function getStripe(): Stripe | null {
  const key = Deno.env.get("STRIPE_SECRET_KEY");
  if (!key) return null;
  // Pin the version the code was written against (the Accounts v2 GA release)
  // so an SDK bump can't silently change request/response shapes under us.
  return new Stripe(key, { apiVersion: "2026-06-24.dahlia" });
}

/**
 * The remaining-balance charge on a booking (Hourly Booking v1, Phase 5).
 * Always returns an UNCONFIRMED PaymentIntent — callers must attach its id to
 * the payment row BEFORE confirming, or the settlement webhook can win the
 * race and strand the invoice in review. Redirects are disabled; dynamic
 * payment methods stay on.
 */
export async function createBalancePaymentIntent(input: {
  invoiceId: string;
  bookingId: string;
  amountCents: number;
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
    // NOT a destination charge: held in the platform balance and paid out to the
    // student after the job by the `provider_payout` job. Mirrors
    // apps/web/lib/stripe/connect.ts — these two must stay in step.
    metadata: {
      booking_id: input.bookingId,
      invoice_id: input.invoiceId,
      payment_kind: "balance",
      payee_account: input.providerStripeAccountId,
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
 * Pay the student out of funds the platform is already holding, once the job is
 * complete. `source_transaction` draws from the specific charge that funded the
 * payout, so it cannot fail on unsettled platform balance. Mirrors
 * `transferToProvider` in apps/web/lib/stripe/connect.ts.
 */
export async function transferToProvider(input: {
  amountCents: number;
  destinationAccountId: string;
  sourceChargeId: string;
  bookingId: string;
  idempotencyKey: string;
}): Promise<
  { configured: true; transferId: string; amountCents: number } | StripeUnconfigured
> {
  const stripe = getStripe();
  if (!stripe) return UNCONFIGURED;

  const transfer = await stripe.transfers.create(
    {
      amount: input.amountCents,
      currency: "usd",
      destination: input.destinationAccountId,
      source_transaction: input.sourceChargeId,
      metadata: { booking_id: input.bookingId },
    },
    { idempotencyKey: input.idempotencyKey },
  );

  return {
    configured: true,
    transferId: transfer.id,
    amountCents: transfer.amount,
  };
}

/** Resolve the charge that settled a PaymentIntent, for `source_transaction`. */
export async function getChargeIdForPaymentIntent(
  paymentIntentId: string,
): Promise<{ configured: true; chargeId: string | null } | StripeUnconfigured> {
  const stripe = getStripe();
  if (!stripe) return UNCONFIGURED;

  const intent = await stripe.paymentIntents.retrieve(paymentIntentId);
  const latest = intent.latest_charge;
  const chargeId = typeof latest === "string" ? latest : (latest?.id ?? null);
  return { configured: true, chargeId };
}

/**
 * Confirm a balance PaymentIntent whose id is already attached to its payment
 * row. `offSession: true` here always — the scheduler charges the saved
 * method. Stripe throws on a hard decline with the PaymentIntent attached;
 * a retry against an already-confirmed intent throws without one — re-read
 * the intent so retries after a crash stay idempotent.
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
