import "server-only";

import type Stripe from "stripe";

import type { Json } from "@/lib/db/types";
import { refundFirstHourFull } from "@/lib/stripe/connect";
import { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

function assertResult(
  result: { error: { code?: string } | null },
  operation: string,
) {
  if (result.error) {
    throw Object.assign(new Error(`${operation} failed`), {
      code: result.error.code ?? operation,
    });
  }
}

/** Process one signature-verified Stripe event through idempotent domain RPCs. */
export async function processStripeWebhookEvent(
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
        assertResult(
          await admin.rpc("settle_balance_payment", {
            p_stripe_payment_intent_id: intent.id,
            p_succeeded_at: new Date(event.created * 1000).toISOString(),
          }),
          "settle_balance_payment",
        );
      } else if (intent.metadata.booking_id) {
        assertResult(
          await admin
            .from("bookings")
            .update({ status: "paid", stripe_payment_intent_id: intent.id })
            .eq("id", intent.metadata.booking_id)
            .in("booking_flow", ["legacy", "quote_v1"])
            .eq("status", "accepted"),
          "settle_legacy_payment",
        );
      }
      break;
    }
    case "payment_intent.payment_failed": {
      const intent = event.data.object as Stripe.PaymentIntent;
      if (intent.metadata.payment_kind === "first_hour") {
        assertResult(
          await admin.rpc("mark_first_hour_payment_unsuccessful", {
            p_stripe_payment_intent_id: intent.id,
            p_target_status: "failed",
            p_failure_code: intent.last_payment_error?.code ?? undefined,
            p_failure_message: intent.last_payment_error?.message ?? undefined,
          }),
          "mark_first_hour_payment_failed",
        );
      } else if (intent.metadata.payment_kind === "balance") {
        assertResult(
          await admin.rpc("mark_balance_payment_unsuccessful", {
            p_stripe_payment_intent_id: intent.id,
            p_target_status: "failed",
            p_failure_code: intent.last_payment_error?.code ?? undefined,
            p_failure_message: intent.last_payment_error?.message ?? undefined,
          }),
          "mark_balance_payment_failed",
        );
      }
      break;
    }
    case "payment_intent.canceled": {
      const intent = event.data.object as Stripe.PaymentIntent;
      if (intent.metadata.payment_kind === "first_hour") {
        assertResult(
          await admin.rpc("mark_first_hour_payment_unsuccessful", {
            p_stripe_payment_intent_id: intent.id,
            p_target_status: "cancelled",
            p_failure_code: intent.cancellation_reason ?? "canceled",
            p_failure_message: "PaymentIntent canceled",
          }),
          "mark_first_hour_payment_cancelled",
        );
      } else if (intent.metadata.payment_kind === "balance") {
        assertResult(
          await admin.rpc("mark_balance_payment_unsuccessful", {
            p_stripe_payment_intent_id: intent.id,
            p_target_status: "cancelled",
            p_failure_code: intent.cancellation_reason ?? "canceled",
            p_failure_message: "PaymentIntent canceled",
          }),
          "mark_balance_payment_cancelled",
        );
      }
      break;
    }
    case "charge.refunded": {
      const charge = event.data.object as Stripe.Charge;
      const paymentIntentId =
        typeof charge.payment_intent === "string"
          ? charge.payment_intent
          : (charge.payment_intent?.id ?? null);
      let refundId = charge.refunds?.data?.[0]?.id ?? undefined;
      if (!refundId && paymentIntentId) {
        const refunds = await stripe.refunds.list({
          payment_intent: paymentIntentId,
          limit: 1,
        });
        refundId = refunds.data[0]?.id;
      }
      if (paymentIntentId && refundId) {
        assertResult(
          await admin.rpc("reconcile_stripe_refund", {
            p_stripe_payment_intent_id: paymentIntentId,
            p_stripe_refund_id: refundId,
            p_amount_cents: charge.amount_refunded,
            p_reason: "charge_refunded",
          }),
          "reconcile_stripe_refund",
        );
      }
      break;
    }
    case "charge.dispute.created":
    case "charge.dispute.updated":
    case "charge.dispute.closed":
      assertResult(
        await admin.rpc("record_stripe_dispute", {
          p_event: event as unknown as Json,
        }),
        "record_stripe_dispute",
      );
      break;
    default:
      break;
  }
}

/** Store a bounded operational code, never a raw Stripe object or secret. */
export function stripeWebhookFailureCode(error: unknown) {
  if (typeof error === "object" && error && "code" in error) {
    return String(error.code).slice(0, 200);
  }
  return "stripe_webhook_processing_failed";
}

async function settleFirstHour(
  admin: AdminClient,
  event: Stripe.Event,
  intent: Stripe.PaymentIntent,
) {
  const paymentMethodId =
    typeof intent.payment_method === "string"
      ? intent.payment_method
      : (intent.payment_method?.id ?? undefined);
  const { data: outcome, error } = await admin.rpc(
    "settle_first_hour_payment",
    {
      p_stripe_payment_intent_id: intent.id,
      p_stripe_payment_method_id: paymentMethodId,
      p_succeeded_at: new Date(event.created * 1000).toISOString(),
    },
  );
  assertResult({ error }, "settle_first_hour_payment");
  if (outcome !== "refund_owed") return;

  const bookingId = intent.metadata.booking_id ?? intent.id;
  const refund = await refundFirstHourFull({
    paymentIntentId: intent.id,
    idempotencyKey: `fhr_${bookingId}`,
    // The intent itself says which model funded it: `transfer_data` is present
    // only on a legacy destination charge, where the student was already paid as
    // the transfer leg. Held-funds charges have nothing to reverse yet.
    reverseTransfer: Boolean(intent.transfer_data),
  });
  if (refund.configured) {
    assertResult(
      await admin.rpc("record_first_hour_refund", {
        p_stripe_payment_intent_id: intent.id,
        p_reason: "late_success_after_deadline",
        p_stripe_refund_id: refund.refundId,
        p_amount_cents: refund.amountCents,
      }),
      "record_first_hour_refund",
    );
  }
}
