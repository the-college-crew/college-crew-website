// stripe-webhook — the source of truth for payment state (SPEC §6).
//
// Deno port of apps/web/app/api/webhooks/stripe/route.ts so web and mobile
// share one webhook code path (iOS arch A-4). Verifies the raw-body
// signature, records + de-duplicates every event in `stripe_webhook_receipts`,
// and routes by `metadata.payment_kind`:
//
//   - hourly `first_hour` success → settle_first_hour_payment (accepted→booked),
//     refunding late/terminal successes without reviving the booking;
//   - hourly `balance` success → settle_balance_payment (invoice_review→completed);
//   - hourly failure/cancellation → mark_{first_hour,balance}_payment_unsuccessful;
//   - refund lifecycle → record_first_hour_refund / reconcile_stripe_refund;
//   - legacy success → the original accepted→paid update.
//
// All domain RPCs are idempotent and state-guarded, so duplicate and
// out-of-order deliveries are safe — including double delivery while the old
// web route and this function run in parallel during cutover.
//
// Auth is the Stripe signature; `verify_jwt = false` in config.toml because
// Stripe cannot send a Supabase JWT. Secrets: STRIPE_SECRET_KEY,
// STRIPE_WEBHOOK_SECRET (this endpoint's own signing secret — NOT the web
// route's). Deploy: npx supabase functions deploy stripe-webhook

import Stripe from "npm:stripe@22";
import { createClient } from "npm:@supabase/supabase-js@2";

// deno-lint-ignore no-explicit-any — the generated Database types live in
// apps/web/lib/db/types.ts and aren't importable here until packages/db is
// extracted; every call below targets DB-validated, idempotent RPCs.
type AdminClient = ReturnType<typeof createClient<any>>;

function getStripe(): Stripe | null {
  const key = Deno.env.get("STRIPE_SECRET_KEY");
  if (!key) return null;
  // Pin the version the code was written against (the Accounts v2 GA release)
  // so an SDK bump can't silently change request/response shapes under us.
  return new Stripe(key, { apiVersion: "2026-06-24.dahlia" });
}

function createAdminClient(): AdminClient {
  return createClient<any>(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

const json = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed." }, 405);
  }

  const stripe = getStripe();
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  if (!stripe || !webhookSecret) {
    return json({ error: "Stripe isn't configured yet." }, 503);
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return json({ error: "Missing signature." }, 400);
  }

  let event: Stripe.Event;
  try {
    // constructEventAsync: Deno's WebCrypto is async-only.
    event = await stripe.webhooks.constructEventAsync(
      await request.text(),
      signature,
      webhookSecret,
    );
  } catch {
    return json({ error: "Invalid signature." }, 400);
  }

  const admin = createAdminClient();

  // Record the event. A duplicate that was already processed short-circuits.
  const nowIso = new Date().toISOString();
  const insert = await admin.from("stripe_webhook_receipts").insert({
    stripe_event_id: event.id,
    event_type: event.type,
    livemode: event.livemode,
    api_version: event.api_version ?? null,
    payload: event as unknown as Record<string, unknown>,
    processing_started_at: nowIso,
    attempt_count: 1,
  });
  let eventToProcess = event;
  if (insert.error) {
    if (insert.error.code !== "23505") {
      // Couldn't persist the receipt — ask Stripe to retry.
      return json({ error: "Could not record event." }, 500);
    }
    const { data: existing } = await admin
      .from("stripe_webhook_receipts")
      .select("id, processed_at")
      .eq("stripe_event_id", event.id)
      .maybeSingle();
    if (!existing) {
      return json({ error: "Receipt not found." }, 500);
    }
    if (existing?.processed_at) {
      return json({ received: true, duplicate: true });
    }
    const claim = await admin.rpc("claim_stripe_webhook_receipt", {
      p_receipt_id: existing.id,
      p_stale_seconds: 300,
    });
    if (claim.error) {
      return json({ error: "Could not claim event." }, 500);
    }
    const claimed = claim.data?.[0];
    if (!claimed) {
      return json(
        { received: true, duplicate: true, processing: true },
        202,
      );
    }
    eventToProcess = claimed.payload as unknown as Stripe.Event;
    if (eventToProcess.id !== event.id) {
      return json({ error: "Receipt mismatch." }, 500);
    }
  }

  try {
    await handleEvent(admin, stripe, eventToProcess);
  } catch (error) {
    await admin
      .from("stripe_webhook_receipts")
      .update({ last_error: webhookFailureCode(error) })
      .eq("stripe_event_id", event.id);
    return json({ error: "Processing failed." }, 500);
  }

  await admin
    .from("stripe_webhook_receipts")
    .update({ processed_at: new Date().toISOString(), last_error: null })
    .eq("stripe_event_id", event.id);

  return json({ received: true });
});

/** Store a bounded operational code, never a raw Stripe object or secret. */
function webhookFailureCode(error: unknown) {
  if (typeof error === "object" && error && "code" in error) {
    return String(error.code).slice(0, 200);
  }
  return "stripe_webhook_processing_failed";
}

async function handleEvent(
  admin: AdminClient,
  stripe: Stripe,
  event: Stripe.Event,
) {
  switch (event.type) {
    case "payment_intent.succeeded": {
      const intent = event.data.object as Stripe.PaymentIntent;
      if (
        intent.metadata.payment_kind === "first_hour" ||
        intent.metadata.payment_kind === "quote_deposit"
      ) {
        await settleFirstHour(admin, stripe, event, intent);
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
      if (
        intent.metadata.payment_kind === "first_hour" ||
        intent.metadata.payment_kind === "quote_deposit"
      ) {
        await admin.rpc("mark_upfront_payment_unsuccessful", {
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
      if (
        intent.metadata.payment_kind === "first_hour" ||
        intent.metadata.payment_kind === "quote_deposit"
      ) {
        await admin.rpc("mark_upfront_payment_unsuccessful", {
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
      // Current API versions no longer embed the refund list on the event's
      // charge object, so fall back to listing the intent's newest refund.
      let refundId = charge.refunds?.data?.[0]?.id ?? undefined;
      if (!refundId && paymentIntentId) {
        const refunds = await stripe.refunds.list({
          payment_intent: paymentIntentId,
          limit: 1,
        });
        refundId = refunds.data[0]?.id;
      }
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
        p_event: event as unknown as Record<string, unknown>,
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
  stripe: Stripe,
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
  // Idempotent via the booking-derived key — the same key the web route used,
  // so a double delivery across both endpoints cannot double-refund.
  const bookingId = intent.metadata.booking_id ?? intent.id;
  const refund = await stripe.refunds.create(
    {
      payment_intent: intent.id,
      reverse_transfer: Boolean(intent.transfer_data),
      refund_application_fee: Boolean(intent.transfer_data),
    },
    { idempotencyKey: `fhr_${bookingId}` },
  );
  await admin.rpc("reconcile_stripe_refund", {
    p_stripe_payment_intent_id: intent.id,
    p_reason: "late_success_after_deadline",
    p_stripe_refund_id: refund.id,
    p_amount_cents: refund.amount,
  });
}
