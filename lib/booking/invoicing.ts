import "server-only";

import { createBalancePaymentIntent } from "@/lib/stripe/connect";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Remaining-balance settlement domain operations (Hourly Booking v1, Phase 5).
 *
 * The customer confirm/recovery actions and the scheduled autocharge all settle
 * the same single `balance` payment row. The webhook is the settlement source
 * of truth; these helpers only claim work and create/confirm PaymentIntents.
 */

export type DueInvoiceOutcome =
  | "not_claimable" // no due, undisputed, unpaid invoice to charge
  | "unconfigured" // Stripe keys absent in this environment
  | "processing" // charge created/confirmed; webhook will settle
  | "requires_action" // needs customer authentication — surfaced for recovery
  | "failed"; // hard decline recorded; recoverable

/**
 * Idempotently charge a due, undisputed invoice's remaining balance off-session.
 * Atomically claims the invoice (single-flight via `claim_due_invoice`), creates
 * the destination charge on the saved method, and records the outcome. Phase 7
 * schedules this; tests invoke it directly. Repeated calls cannot double-charge:
 * a claimed invoice is in `processing`, and the payment row is unique per
 * booking with a deterministic idempotency key.
 */
export async function attemptDueInvoiceCharge(
  invoiceId: string,
): Promise<DueInvoiceOutcome> {
  const admin = createAdminClient();

  const { data: claim, error } = await admin
    .rpc("claim_due_invoice", { p_invoice_id: invoiceId })
    .maybeSingle();
  if (error || !claim) return "not_claimable";
  if (!claim.stripe_payment_method_id || !claim.stripe_customer_id) {
    // No saved method to charge off-session — leave it recoverable.
    await admin.rpc("mark_balance_payment_unsuccessful", {
      p_stripe_payment_intent_id: `missing_method_${invoiceId}`,
      p_target_status: "requires_action",
      p_failure_code: "no_saved_method",
      p_failure_message: "No saved payment method for off-session charge.",
    });
    return "requires_action";
  }

  const intent = await createBalancePaymentIntent({
    invoiceId,
    bookingId: claim.booking_id,
    amountCents: claim.amount_cents,
    applicationFeeCents: claim.application_fee_cents,
    stripeCustomerId: claim.stripe_customer_id,
    stripePaymentMethodId: claim.stripe_payment_method_id,
    providerStripeAccountId: claim.stripe_connected_account_id,
    idempotencyKey: claim.idempotency_key,
    confirm: true,
    offSession: true,
  });
  if (!intent.configured) return "unconfigured";

  await admin.rpc("attach_balance_payment_intent", {
    p_invoice_id: invoiceId,
    p_stripe_payment_intent_id: intent.paymentIntentId,
  });

  if (intent.status === "succeeded" || intent.status === "processing") {
    // Success/processing settles via the webhook (source of truth).
    return "processing";
  }
  if (intent.status === "requires_action") {
    await admin.rpc("mark_balance_payment_unsuccessful", {
      p_stripe_payment_intent_id: intent.paymentIntentId,
      p_target_status: "requires_action",
      p_failure_code: "authentication_required",
      p_failure_message: "The saved card needs customer authentication.",
    });
    return "requires_action";
  }

  await admin.rpc("mark_balance_payment_unsuccessful", {
    p_stripe_payment_intent_id: intent.paymentIntentId,
    p_target_status: "failed",
    p_failure_code: intent.status,
    p_failure_message: "The balance charge could not be completed.",
  });
  return "failed";
}
