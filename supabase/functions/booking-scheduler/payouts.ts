import { createAdminClient } from "./admin.ts";
import { getChargeIdForPaymentIntent, transferToProvider } from "./stripe.ts";

/**
 * Port of apps/web/lib/booking/payouts.ts — these two must stay in step, and the
 * EDGE copy is the one that actually runs (the cron targets this function).
 *
 * Pays the student once the job is complete. Nothing is transferred while a job
 * is in flight: both charges sit in the PLATFORM balance, so a cash settlement
 * needs no clawback and a cancellation is a plain refund with nothing to reverse.
 * This is the one place money leaves the platform.
 *
 * Idempotent three ways because it moves real money: legs already recorded
 * `paid` are skipped, the Stripe idempotency key collapses a retried transfer to
 * the same one, and `record_provider_payout` upserts on that same key.
 */
export async function attemptProviderPayout(
  bookingId: string,
): Promise<"paid" | "nothing" | "unconfigured"> {
  const admin = createAdminClient();

  const { data: plan, error } = await admin.rpc("provider_payout_plan", {
    p_booking_id: bookingId,
  });
  if (error) throw error;
  if (!plan || plan.length === 0) return "nothing";

  const { data: settled } = await admin
    .from("booking_provider_payouts")
    .select("payment_id")
    .eq("booking_id", bookingId)
    .eq("status", "paid");
  const alreadyPaid = new Set(
    (settled ?? []).map((row: { payment_id: string }) => row.payment_id),
  );

  let paidAny = false;

  for (const leg of plan) {
    if (alreadyPaid.has(leg.payment_id)) continue;

    const idempotencyKey = `payout_${bookingId}_${leg.payment_id}`;

    const charge = await getChargeIdForPaymentIntent(leg.stripe_payment_intent_id);
    if (!charge.configured) return "unconfigured";
    if (!charge.chargeId) {
      await admin.rpc("record_provider_payout", {
        p_booking_id: bookingId,
        p_payment_id: leg.payment_id,
        p_idempotency_key: idempotencyKey,
        p_amount_cents: leg.payout_amount_cents,
        p_destination_account_id: leg.destination_account_id,
        p_status: "failed",
        p_error: "No charge found for the settled payment intent.",
      });
      throw new Error("PayoutSourceChargeMissing");
    }

    const transfer = await transferToProvider({
      amountCents: leg.payout_amount_cents,
      destinationAccountId: leg.destination_account_id,
      sourceChargeId: charge.chargeId,
      bookingId,
      idempotencyKey,
    });
    if (!transfer.configured) return "unconfigured";

    await admin.rpc("record_provider_payout", {
      p_booking_id: bookingId,
      p_payment_id: leg.payment_id,
      p_idempotency_key: idempotencyKey,
      p_amount_cents: transfer.amountCents,
      p_destination_account_id: leg.destination_account_id,
      p_source_charge_id: charge.chargeId,
      p_stripe_transfer_id: transfer.transferId,
      p_status: "paid",
    });
    paidAny = true;
  }

  return paidAny ? "paid" : "nothing";
}
