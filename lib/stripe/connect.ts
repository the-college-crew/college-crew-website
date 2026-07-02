import "server-only";

import type { Booking } from "@/lib/db/types";
import { getStripe } from "@/lib/stripe/server";

/**
 * Stripe Connect (Express) seams — the ONLY places payment code touches
 * Stripe. The test account isn't provisioned yet, so every caller must
 * handle `{ configured: false }`; the real code paths below are written to
 * the spec (destination charges + application fee) but are inert until
 * STRIPE_SECRET_KEY exists in .env.local.
 *
 * TODO(stripe): once the test account exists, verify both flows end-to-end
 * and wire the webhook secret (app/api/webhooks/stripe/route.ts).
 */

export type StripeUnconfigured = { configured: false; reason: string };

const UNCONFIGURED: StripeUnconfigured = {
  configured: false,
  reason:
    "Stripe test account isn't set up yet — payments are stubbed until it is.",
};

/**
 * Hosted Express onboarding for an APPROVED provider (SPEC §6: Stripe is
 * connected after approval, never during the wizard).
 */
export async function createConnectOnboardingLink(input: {
  stripeAccountId: string | null;
  refreshUrl: string;
  returnUrl: string;
}): Promise<
  { configured: true; url: string; stripeAccountId: string } | StripeUnconfigured
> {
  const stripe = getStripe();
  if (!stripe) return UNCONFIGURED;

  const account = input.stripeAccountId
    ? await stripe.accounts.retrieve(input.stripeAccountId)
    : await stripe.accounts.create({ type: "express" });

  const link = await stripe.accountLinks.create({
    account: account.id,
    refresh_url: input.refreshUrl,
    return_url: input.returnUrl,
    type: "account_onboarding",
  });

  return { configured: true, url: link.url, stripeAccountId: account.id };
}

/**
 * Charge-after-accept (SPEC §3/§6): the customer confirms an accepted
 * booking, we create a destination charge for the full price with our 15%
 * as the application fee; the remainder is the provider's payout.
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
