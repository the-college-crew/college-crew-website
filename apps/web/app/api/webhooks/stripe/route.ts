import { NextResponse } from "next/server";
import type Stripe from "stripe";

import type { Json } from "@/lib/db/types";
import { hasServiceRoleEnv } from "@/lib/env";
import { getStripe } from "@/lib/stripe/server";
import {
  processStripeWebhookEvent,
  stripeWebhookFailureCode,
} from "@/lib/stripe/webhook-events";
import { createAdminClient } from "@/lib/supabase/admin";

/** Verify, durably record, atomically claim, and process a Stripe event. */
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

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      await request.text(),
      signature,
      webhookSecret,
    );
  } catch {
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }

  const admin = createAdminClient();
  const nowIso = new Date().toISOString();
  const insert = await admin.from("stripe_webhook_receipts").insert({
    stripe_event_id: event.id,
    event_type: event.type,
    livemode: event.livemode,
    api_version: event.api_version ?? null,
    payload: event as unknown as Json,
    processing_started_at: nowIso,
    attempt_count: 1,
  });

  let eventToProcess = event;
  if (insert.error) {
    if (insert.error.code !== "23505") {
      return NextResponse.json(
        { error: "Could not record event." },
        { status: 500 },
      );
    }
    const { data: existing } = await admin
      .from("stripe_webhook_receipts")
      .select("id, processed_at")
      .eq("stripe_event_id", event.id)
      .maybeSingle();
    if (!existing) {
      return NextResponse.json({ error: "Receipt not found." }, { status: 500 });
    }
    if (existing.processed_at) {
      return NextResponse.json({ received: true, duplicate: true });
    }
    const claim = await admin.rpc("claim_stripe_webhook_receipt", {
      p_receipt_id: existing.id,
      p_stale_seconds: 300,
    });
    if (claim.error) {
      return NextResponse.json({ error: "Could not claim event." }, { status: 500 });
    }
    const claimed = claim.data?.[0];
    if (!claimed) {
      return NextResponse.json(
        { received: true, duplicate: true, processing: true },
        { status: 202 },
      );
    }
    eventToProcess = claimed.payload as unknown as Stripe.Event;
    if (eventToProcess.id !== event.id) {
      return NextResponse.json({ error: "Receipt mismatch." }, { status: 500 });
    }
  }

  try {
    await processStripeWebhookEvent(admin, stripe, eventToProcess);
  } catch (error) {
    await admin
      .from("stripe_webhook_receipts")
      .update({ last_error: stripeWebhookFailureCode(error) })
      .eq("stripe_event_id", event.id);
    return NextResponse.json({ error: "Processing failed." }, { status: 500 });
  }

  await admin
    .from("stripe_webhook_receipts")
    .update({ processed_at: new Date().toISOString(), last_error: null })
    .eq("stripe_event_id", event.id);

  return NextResponse.json({ received: true });
}
