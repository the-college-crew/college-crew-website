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
 * On a Stripe failure the row is intentionally LEFT `created` so it stays a
 * retryable operational record — the charge.refunded webhook + reconcile repair
 * state if Stripe actually succeeded, and a later retry can re-run it. We never
 * mark a refund succeeded unless Stripe returned a refund id.
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
        // Stripe isn't configured in this environment; leave it retryable.
        return { executed, failed, unconfigured: true };
      }
      await admin.rpc("settle_booking_refund", {
        p_idempotency_key: refund.idempotency_key,
        p_status: "succeeded",
        p_stripe_refund_id: result.refundId,
        p_stripe_transfer_reversal_id: result.transferReversalId ?? undefined,
      });
      executed += 1;
    } catch (error) {
      // Retain a retryable record; webhook reconciliation repairs a real success.
      console.error(`Refund execution failed for booking ${bookingId}:`, error);
      failed += 1;
    }
  }

  return { executed, failed, unconfigured: false };
}
