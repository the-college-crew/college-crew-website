import "server-only";

import {
  getChargeIdForPaymentIntent,
  transferToProvider,
} from "@/lib/stripe/connect";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Pay the student once the job is complete.
 *
 * Under the held-funds model nothing is transferred while the job is in flight:
 * the first hour and the balance both sit in the PLATFORM balance, so a job that
 * settles in cash needs no clawback and a cancellation is a plain refund with no
 * transfer to reverse. This is the one place money leaves the platform.
 *
 * `provider_payout_plan` decides the amounts — the whole rake is withheld from
 * the first hour and the balance passes through in full — and returns one leg per
 * funding charge so each transfer can cite its own `source_transaction`.
 *
 * Idempotent three ways, because this moves real money: legs already recorded
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

  // Skip anything already paid so a retry never re-enters Stripe needlessly.
  const { data: settled } = await admin
    .from("booking_provider_payouts")
    .select("payment_id")
    .eq("booking_id", bookingId)
    .eq("status", "paid");
  const alreadyPaid = new Set((settled ?? []).map((row) => row.payment_id));

  let paidAny = false;

  for (const leg of plan) {
    if (alreadyPaid.has(leg.payment_id)) continue;

    const idempotencyKey = `payout_${bookingId}_${leg.payment_id}`;

    const charge = await getChargeIdForPaymentIntent(leg.stripe_payment_intent_id);
    if (!charge.configured) return "unconfigured";
    if (!charge.chargeId) {
      // Succeeded payments always have a charge; if one doesn't, record the
      // failure and let the founder alert surface it rather than guessing.
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
