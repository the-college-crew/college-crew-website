import { NextResponse } from "next/server";
import type Stripe from "stripe";

import type { Json } from "@/lib/db/types";
import { hasServiceRoleEnv } from "@/lib/env";
import { getStripe, isStripeLiveMode } from "@/lib/stripe/server";
import {
  processStripeWebhookEvent,
  processStripeV2EventNotification,
  stripeWebhookFailureCode,
} from "@/lib/stripe/webhook-events";
import { createAdminClient } from "@/lib/supabase/admin";

/** Verify, durably record, atomically claim, and process a Stripe event. */
export async function POST(request: Request) {
  const stripe = getStripe();
  const webhookSecrets = [
    process.env.STRIPE_WEBHOOK_SECRET,
    process.env.STRIPE_CONNECT_WEBHOOK_SECRET,
  ].filter((value): value is string => Boolean(value));
  if (!stripe || webhookSecrets.length === 0 || !hasServiceRoleEnv()) {
    return NextResponse.json(
      { error: "Stripe isn't configured yet." },
      { status: 503 },
    );
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing signature." }, { status: 400 });
  }

  const payload = await request.text();
  let event: Stripe.Event | Stripe.V2.Core.EventNotification | undefined;
  let isV2Event = false;
  for (const webhookSecret of webhookSecrets) {
    try {
      event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
      break;
    } catch {
      // The payload may be an Accounts v2 thin event, or may have been signed
      // by the other configured destination. Try every trusted secret below.
    }
  }
  if (!event) {
    for (const webhookSecret of webhookSecrets) {
      try {
        event = stripe.parseEventNotification(
          payload,
          signature,
          webhookSecret,
        );
        isV2Event = true;
        break;
      } catch {
        // Keep trying the bounded configured secret set.
      }
    }
  }
  if (!event) {
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }
  if (event.livemode !== isStripeLiveMode()) {
    return NextResponse.json(
      { error: "Stripe event mode does not match this deployment." },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const nowIso = new Date().toISOString();
  const insert = await admin.from("stripe_webhook_receipts").insert({
    stripe_event_id: event.id,
    event_type: event.type,
    livemode: event.livemode,
    api_version: isV2Event
      ? null
      : (event as Stripe.Event).api_version ?? null,
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
    eventToProcess = claimed.payload as unknown as
      | Stripe.Event
      | Stripe.V2.Core.EventNotification;
    if (eventToProcess.id !== event.id) {
      return NextResponse.json({ error: "Receipt mismatch." }, { status: 500 });
    }
  }

  try {
    if (
      isV2Event ||
      (eventToProcess as { object?: string }).object === "v2.core.event"
    ) {
      await processStripeV2EventNotification(
        admin,
        eventToProcess as Stripe.V2.Core.EventNotification,
      );
    } else {
      await processStripeWebhookEvent(
        admin,
        stripe,
        eventToProcess as Stripe.Event,
      );
    }
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
