import "server-only";

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

  const intent = await stripe.paymentIntents.create({
    amount: input.booking.price_cents,
    currency: "usd",
    application_fee_amount: input.booking.platform_fee_cents,
    transfer_data: { destination: input.providerStripeAccountId },
    metadata: { booking_id: input.booking.id },
    automatic_payment_methods: { enabled: true },
  });

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
