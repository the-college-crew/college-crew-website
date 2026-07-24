import { createAdminClient } from "./admin.ts";
import {
  confirmBalancePaymentIntent,
  createBalancePaymentIntent,
} from "./stripe.ts";

/**
 * Remaining-balance settlement domain operations (Hourly Booking v1, Phase 5).
 * Port of apps/web/lib/booking/invoicing.ts.
 *
 * The customer confirm/recovery actions and this scheduled autocharge all
 * settle the same single `balance` payment row. The webhook is the settlement
 * source of truth; this helper only claims work and creates/confirms
 * PaymentIntents.
 */

export type DueInvoiceOutcome =
  | "not_claimable" // no due, undisputed, unpaid invoice to charge
  | "unconfigured" // Stripe keys absent in this environment
  | "processing" // charge created/confirmed; webhook will settle
  | "requires_action" // needs customer authentication — surfaced for recovery
  | "failed"; // hard decline recorded; recoverable

type DueInvoiceClaim = {
  booking_id: string;
  amount_cents: number;
  application_fee_cents: number;
  stripe_customer_id: string | null;
  stripe_payment_method_id: string | null;
  stripe_connected_account_id: string;
  idempotency_key: string;
};

/**
 * Idempotently charge a due, undisputed invoice's remaining balance
 * off-session. Atomically claims the invoice (single-flight via
 * `claim_due_invoice`), creates the destination charge on the saved method,
 * and records the outcome. Repeated calls cannot double-charge: a claimed
 * invoice is in `processing`, and the payment row is unique per booking with
 * a deterministic idempotency key.
 */
export async function attemptDueInvoiceCharge(
  invoiceId: string,
): Promise<DueInvoiceOutcome> {
  const admin = createAdminClient();

  const { data, error } = await admin
    .rpc("claim_due_invoice", { p_invoice_id: invoiceId })
    .maybeSingle();
  const claim = data as DueInvoiceClaim | null;
  if (error || !claim) return "not_claimable";
  if (!claim.stripe_payment_method_id || !claim.stripe_customer_id) {
    // Stripe cannot create a PaymentIntent, so settle by the durable invoice
    // claim instead of inventing an external id that cannot match a payment.
    await admin.rpc("mark_balance_payment_unsuccessful_by_invoice", {
      p_invoice_id: invoiceId,
      p_target_status: "requires_action",
      p_failure_code: "no_saved_method",
      p_failure_message: "No saved payment method for off-session charge.",
    });
    return "requires_action";
  }

  // Create unconfirmed, attach, THEN confirm — the settlement webhook can win
  // a race against the attach, and an unattached success strands the invoice.
  let intent: Awaited<ReturnType<typeof createBalancePaymentIntent>>;
  try {
    intent = await createBalancePaymentIntent({
      invoiceId,
      bookingId: claim.booking_id,
      amountCents: claim.amount_cents,
      stripeCustomerId: claim.stripe_customer_id,
      stripePaymentMethodId: claim.stripe_payment_method_id,
      providerStripeAccountId: claim.stripe_connected_account_id,
      idempotencyKey: claim.idempotency_key,
    });
  } catch (error) {
    await admin.rpc("release_due_invoice_claim", { p_invoice_id: invoiceId });
    throw error;
  }
  if (!intent.configured) {
    await admin.rpc("release_due_invoice_claim", { p_invoice_id: invoiceId });
    return "unconfigured";
  }

  const attach = await admin.rpc("attach_balance_payment_intent", {
    p_invoice_id: invoiceId,
    p_stripe_payment_intent_id: intent.paymentIntentId,
  });
  if (attach.error) {
    // Nothing was confirmed, so no money moved; the retried claim reuses the
    // same idempotent intent.
    await admin.rpc("release_due_invoice_claim", { p_invoice_id: invoiceId });
    throw attach.error;
  }

  let confirmed: Awaited<ReturnType<typeof confirmBalancePaymentIntent>>;
  try {
    confirmed = await confirmBalancePaymentIntent({
      paymentIntentId: intent.paymentIntentId,
      offSession: true,
    });
  } catch (error) {
    await admin.rpc("release_due_invoice_claim", { p_invoice_id: invoiceId });
    throw error;
  }
  if (!confirmed.configured) {
    await admin.rpc("release_due_invoice_claim", { p_invoice_id: invoiceId });
    return "unconfigured";
  }

  if (confirmed.status === "succeeded" || confirmed.status === "processing") {
    // Success/processing settles via the webhook (source of truth).
    return "processing";
  }
  if (confirmed.status === "requires_action") {
    await admin.rpc("mark_balance_payment_unsuccessful", {
      p_stripe_payment_intent_id: confirmed.paymentIntentId,
      p_target_status: "requires_action",
      p_failure_code: "authentication_required",
      p_failure_message: "The saved card needs customer authentication.",
    });
    return "requires_action";
  }

  await admin.rpc("mark_balance_payment_unsuccessful", {
    p_stripe_payment_intent_id: confirmed.paymentIntentId,
    p_target_status: "failed",
    p_failure_code: confirmed.status,
    p_failure_message: "The balance charge could not be completed.",
  });
  return "failed";
}
