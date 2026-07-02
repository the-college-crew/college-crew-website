import { NextResponse } from "next/server";

import { hasServiceRoleEnv } from "@/lib/env";
import { getStripe } from "@/lib/stripe/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Stripe webhook (SPEC §6): the production path that flips a booking to
 * `paid` on payment_intent.succeeded. Inert until the Stripe test account
 * and STRIPE_WEBHOOK_SECRET exist.
 *
 * TODO(stripe): register this endpoint in the Stripe dashboard (test mode)
 * and verify end-to-end with `stripe listen --forward-to
 * localhost:3000/api/webhooks/stripe`.
 */
export async function POST(request: Request) {
  const stripe = getStripe();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !webhookSecret || !hasServiceRoleEnv()) {
    return NextResponse.json(
      { error: "Stripe isn't configured yet." },
      { status: 503 },
    );
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing signature." }, { status: 400 });
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(
      await request.text(),
      signature,
      webhookSecret,
    );
  } catch {
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }

  if (event.type === "payment_intent.succeeded") {
    const intent = event.data.object;
    const bookingId = intent.metadata.booking_id;

    if (bookingId) {
      // Service role: the state-machine trigger still validates the edge.
      const admin = createAdminClient();
      await admin
        .from("bookings")
        .update({
          status: "paid",
          stripe_payment_intent_id: intent.id,
        })
        .eq("id", bookingId)
        .eq("status", "accepted");
    }
  }

  return NextResponse.json({ received: true });
}
