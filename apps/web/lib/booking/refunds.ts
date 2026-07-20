import "server-only";

import { refundDestinationCharge } from "@/lib/stripe/connect";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Execute every pending (`created`) refund request on a booking (Phase 6). The
 * trusted RPCs record the durable refund intent; this reads those rows with the
 * admin client (booking_refunds/booking_payments are server-only), performs the
 * Stripe destination-charge refund, and settles the row. A full refund omits the
 * amount (Stripe reverses the whole transfer + fee); a partial passes the amount
 * (Stripe reverses/refunds proportionally).
 *
 * Failures are settled to `failed` so founder operations can see and explicitly
 * retry the same ledger row with the same Stripe idempotency key. A later
 * charge.refunded webhook can still reconcile a success that outlived the
 * request. We never mark a refund succeeded unless Stripe returned a refund id.
 */
export async function executePendingRefunds(
  bookingId: string,
): Promise<{ executed: number; failed: number; unconfigured: boolean }> {
  const admin = createAdminClient();
  const { data: refunds } = await admin
    .from("booking_refunds")
    .select("id, idempotency_key, amount_cents, payment_id")
    .eq("booking_id", bookingId)
    .eq("status", "created");

  if (!refunds || refunds.length === 0) {
    return { executed: 0, failed: 0, unconfigured: false };
  }

  let executed = 0;
  let failed = 0;

  for (const refund of refunds) {
    const { data: payment } = await admin
      .from("booking_payments")
      .select("stripe_payment_intent_id, amount_cents")
      .eq("id", refund.payment_id)
      .maybeSingle();
    if (!payment?.stripe_payment_intent_id) {
      await settleRefundFailure(
        admin,
        refund.idempotency_key,
        "missing_payment_intent",
        "The payment record has no Stripe PaymentIntent.",
      );
      failed += 1;
      continue;
    }

    const isFull = refund.amount_cents >= payment.amount_cents;
    try {
      const result = await refundDestinationCharge({
        paymentIntentId: payment.stripe_payment_intent_id,
        amountCents: isFull ? undefined : refund.amount_cents,
        idempotencyKey: refund.idempotency_key,
      });
      if (!result.configured) {
        await settleRefundFailure(
          admin,
          refund.idempotency_key,
          "stripe_unconfigured",
          "Stripe refund processing is not configured.",
        );
        return { executed, failed: failed + 1, unconfigured: true };
      }
      const settlement = await admin.rpc("settle_booking_refund", {
        p_idempotency_key: refund.idempotency_key,
        p_status: "succeeded",
        p_stripe_refund_id: result.refundId,
        p_stripe_transfer_reversal_id: result.transferReversalId ?? undefined,
      });
      if (settlement.error) throw settlement.error;
      executed += 1;
    } catch (error) {
      const code =
        typeof error === "object" && error && "code" in error
          ? String(error.code).slice(0, 100)
          : "stripe_refund_failed";
      await settleRefundFailure(
        admin,
        refund.idempotency_key,
        code,
        "The Stripe refund request failed.",
      );
      console.error("Refund execution failed", { bookingId, code });
      failed += 1;
    }
  }

  return { executed, failed, unconfigured: false };
}

async function settleRefundFailure(
  admin: ReturnType<typeof createAdminClient>,
  idempotencyKey: string,
  code: string,
  message: string,
) {
  const { error } = await admin.rpc("settle_booking_refund", {
    p_idempotency_key: idempotencyKey,
    p_status: "failed",
    p_failure_code: code.slice(0, 100),
    p_failure_message: message.slice(0, 500),
  });
  if (error) {
    console.error("Could not record refund failure", {
      idempotencyKey,
      code: error.code,
    });
  }
}
