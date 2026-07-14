import { NextResponse } from "next/server";
import type Stripe from "stripe";

import type { Json } from "@/lib/db/types";
import { hasServiceRoleEnv } from "@/lib/env";
import { refundFirstHourFull } from "@/lib/stripe/connect";
import { getStripe } from "@/lib/stripe/server";
import { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

/**
 * Stripe webhook (SPEC §6) — the source of truth for payment state. Verifies
 * the raw-body signature, records + de-duplicates every event in
 * `stripe_webhook_receipts`, and routes by `metadata.payment_kind`:
 *
 *   - hourly `first_hour` success → settle_first_hour_payment (accepted→booked),
 *     refunding late/terminal successes without reviving the booking;
 *   - hourly `balance` success → settle_balance_payment (invoice_review→completed);
 *   - hourly failure/cancellation → mark_{first_hour,balance}_payment_unsuccessful;
 *   - refund lifecycle → record_first_hour_refund;
 *   - legacy success → the original accepted→paid update.
 *
 * All domain RPCs are idempotent and state-guarded, so duplicate and
 * out-of-order deliveries are safe. The browser never advances booking state.
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

  // Record the event. A duplicate that was already processed short-circuits.
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
  if (insert.error) {
    if (insert.error.code !== "23505") {
      // Couldn't persist the receipt — ask Stripe to retry.
      return NextResponse.json({ error: "Could not record event." }, { status: 500 });
    }
    const { data: existing } = await admin
      .from("stripe_webhook_receipts")
      .select("processed_at")
      .eq("stripe_event_id", event.id)
      .maybeSingle();
    if (existing?.processed_at) {
      return NextResponse.json({ received: true, duplicate: true });
    }
    // A prior attempt recorded but never finished; reprocess (RPCs are idempotent).
    await admin
      .from("stripe_webhook_receipts")
      .update({ processing_started_at: nowIso })
      .eq("stripe_event_id", event.id);
  }

  try {
    await handleEvent(admin, stripe, event);
  } catch (error) {
    await admin
      .from("stripe_webhook_receipts")
      .update({ last_error: String(error) })
      .eq("stripe_event_id", event.id);
    return NextResponse.json({ error: "Processing failed." }, { status: 500 });
  }

  await admin
    .from("stripe_webhook_receipts")
    .update({ processed_at: new Date().toISOString(), last_error: null })
    .eq("stripe_event_id", event.id);

  return NextResponse.json({ received: true });
}

async function handleEvent(
  admin: AdminClient,
  stripe: Stripe,
  event: Stripe.Event,
) {
  switch (event.type) {
    case "payment_intent.succeeded": {
      const intent = event.data.object as Stripe.PaymentIntent;
      if (intent.metadata.payment_kind === "first_hour") {
        await settleFirstHour(admin, event, intent);
      } else if (intent.metadata.payment_kind === "balance") {
        await admin.rpc("settle_balance_payment", {
          p_stripe_payment_intent_id: intent.id,
          p_succeeded_at: new Date(event.created * 1000).toISOString(),
        });
      } else if (intent.metadata.booking_id) {
        // Legacy full-price flow: the state-machine trigger validates the edge.
        await admin
          .from("bookings")
          .update({ status: "paid", stripe_payment_intent_id: intent.id })
          .eq("id", intent.metadata.booking_id)
          .eq("booking_flow", "legacy")
          .eq("status", "accepted");
      }
      break;
    }
    case "payment_intent.payment_failed": {
      const intent = event.data.object as Stripe.PaymentIntent;
      if (intent.metadata.payment_kind === "first_hour") {
        await admin.rpc("mark_first_hour_payment_unsuccessful", {
          p_stripe_payment_intent_id: intent.id,
          p_target_status: "failed",
          p_failure_code: intent.last_payment_error?.code ?? undefined,
          p_failure_message: intent.last_payment_error?.message ?? undefined,
        });
      } else if (intent.metadata.payment_kind === "balance") {
        await admin.rpc("mark_balance_payment_unsuccessful", {
          p_stripe_payment_intent_id: intent.id,
          p_target_status: "failed",
          p_failure_code: intent.last_payment_error?.code ?? undefined,
          p_failure_message: intent.last_payment_error?.message ?? undefined,
        });
      }
      break;
    }
    case "payment_intent.canceled": {
      const intent = event.data.object as Stripe.PaymentIntent;
      if (intent.metadata.payment_kind === "first_hour") {
        await admin.rpc("mark_first_hour_payment_unsuccessful", {
          p_stripe_payment_intent_id: intent.id,
          p_target_status: "cancelled",
          p_failure_code: intent.cancellation_reason ?? "canceled",
          p_failure_message: "PaymentIntent canceled",
        });
      } else if (intent.metadata.payment_kind === "balance") {
        await admin.rpc("mark_balance_payment_unsuccessful", {
          p_stripe_payment_intent_id: intent.id,
          p_target_status: "cancelled",
          p_failure_code: intent.cancellation_reason ?? "canceled",
          p_failure_message: "PaymentIntent canceled",
        });
      }
      break;
    }
    case "charge.refunded": {
      const charge = event.data.object as Stripe.Charge;
      const paymentIntentId =
        typeof charge.payment_intent === "string"
          ? charge.payment_intent
          : (charge.payment_intent?.id ?? null);
      const refundId = charge.refunds?.data?.[0]?.id ?? undefined;
      if (paymentIntentId && refundId) {
        // Reconcile any destination-charge refund (first-hour or balance,
        // full or partial) against our booking_refunds ledger. Repairs state
        // when the action's synchronous settle never landed, and records a
        // dashboard-initiated refund we never authored. Idempotent on the
        // unique Stripe refund id.
        await admin.rpc("reconcile_stripe_refund", {
          p_stripe_payment_intent_id: paymentIntentId,
          p_stripe_refund_id: refundId,
          p_amount_cents: charge.amount_refunded,
          p_reason: "charge_refunded",
        });
      }
      break;
    }
    case "charge.dispute.created":
    case "charge.dispute.updated":
    case "charge.dispute.closed": {
      // External card-network dispute. Recorded and founder-alerted, kept
      // strictly separate from internal booking disputes; never auto-resolved.
      await admin.rpc("record_stripe_dispute", {
        p_event: event as unknown as Json,
      });
      break;
    }
    default:
      // Recorded and acknowledged; later phases add their own consequences.
      break;
  }
}

/** Settle a first-hour success; refund late/terminal successes with reversal. */
async function settleFirstHour(
  admin: AdminClient,
  event: Stripe.Event,
  intent: Stripe.PaymentIntent,
) {
  const paymentMethodId =
    typeof intent.payment_method === "string"
      ? intent.payment_method
      : (intent.payment_method?.id ?? undefined);
  const succeededAt = new Date(event.created * 1000).toISOString();

  const { data: outcome } = await admin.rpc("settle_first_hour_payment", {
    p_stripe_payment_intent_id: intent.id,
    p_stripe_payment_method_id: paymentMethodId,
    p_succeeded_at: succeededAt,
  });

  if (outcome !== "refund_owed") return;

  // Success arrived after the deadline / in a terminal state: refund fully with
  // transfer + application-fee reversal and record it. The booking stays put.
  const bookingId = intent.metadata.booking_id ?? intent.id;
  const refund = await refundFirstHourFull({
    paymentIntentId: intent.id,
    idempotencyKey: `fhr_${bookingId}`,
  });
  if (refund.configured) {
    await admin.rpc("record_first_hour_refund", {
      p_stripe_payment_intent_id: intent.id,
      p_reason: "late_success_after_deadline",
      p_stripe_refund_id: refund.refundId,
      p_amount_cents: refund.amountCents,
    });
  }
}
