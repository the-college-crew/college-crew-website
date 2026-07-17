import "server-only";

import { getStripe } from "@/lib/stripe/server";
import type { StripeUnconfigured } from "@/lib/stripe/connect";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * One Stripe Customer per College Crew customer, so the first-hour payment can
 * save its method (off_session) for the same booking's later balance charge.
 *
 * The mapping lives in the server-only `stripe_customers` table (never
 * browser-readable). Creation is idempotent two ways: a deterministic Stripe
 * idempotency key collapses concurrent creates to one Customer, and the
 * upsert-then-reselect tolerates a race on the mapping row.
 */
export async function ensureStripeCustomerForUser(input: {
  userId: string;
  email: string;
  name?: string | null;
}): Promise<
  { configured: true; stripeCustomerId: string } | StripeUnconfigured
> {
  const stripe = getStripe();
  if (!stripe) {
    return {
      configured: false,
      reason:
        "Stripe isn't configured — set STRIPE_SECRET_KEY in .env.local to enable payments.",
    };
  }

  const admin = createAdminClient();

  const { data: existing } = await admin
    .from("stripe_customers")
    .select("stripe_customer_id")
    .eq("user_id", input.userId)
    .maybeSingle();
  if (existing?.stripe_customer_id) {
    return { configured: true, stripeCustomerId: existing.stripe_customer_id };
  }

  const customer = await stripe.customers.create(
    {
      email: input.email,
      name: input.name ?? undefined,
      metadata: { cc_user_id: input.userId },
    },
    { idempotencyKey: `cc_customer_${input.userId}` },
  );

  await admin
    .from("stripe_customers")
    .upsert(
      { user_id: input.userId, stripe_customer_id: customer.id },
      { onConflict: "user_id", ignoreDuplicates: true },
    );

  // Re-read so a row written by a concurrent request wins deterministically.
  const { data: settled } = await admin
    .from("stripe_customers")
    .select("stripe_customer_id")
    .eq("user_id", input.userId)
    .maybeSingle();

  return {
    configured: true,
    stripeCustomerId: settled?.stripe_customer_id ?? customer.id,
  };
}
