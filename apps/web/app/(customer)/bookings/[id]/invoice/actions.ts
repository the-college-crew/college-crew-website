"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireUser } from "@/lib/auth/session";
import { normalizeTipCents } from "@/lib/booking/policy";
import { requestOperationMessage } from "@/lib/booking/requests";
import {
  confirmBalancePaymentIntent,
  createBalancePaymentIntent,
} from "@/lib/stripe/connect";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type InvoicePayState = {
  error?: string;
  /** Stripe isn't configured in this environment. */
  unconfigured?: boolean;
  /** The zero-balance invoice settled with no charge. */
  settled?: boolean;
  /** The saved-method charge is confirming; the webhook will complete it. */
  processing?: boolean;
  /** Mount the Payment Element to authenticate / collect a method. */
  clientSecret?: string;
};

type SavedMethod = {
  stripeCustomerId: string;
  stripePaymentMethodId: string | null;
  providerStripeAccountId: string;
};

/**
 * Read the saved off-session method + provider connected account for a booking.
 * booking_payments is server-only (service-role grant), so this uses the admin
 * client — always AFTER the caller has authorized on the customer-owned booking.
 */
async function loadSavedMethod(
  bookingId: string,
  providerId: string,
): Promise<SavedMethod | null> {
  const admin = createAdminClient();
  const { data: firstHour } = await admin
    .from("booking_payments")
    .select("stripe_customer_id, stripe_payment_method_id")
    .eq("booking_id", bookingId)
    .in("kind", ["first_hour", "quote_deposit"])
    .maybeSingle();
  if (!firstHour?.stripe_customer_id) return null;

  const { data: provider } = await admin
    .from("provider_profiles")
    .select("stripe_account_id")
    .eq("id", providerId)
    .maybeSingle();
  if (!provider?.stripe_account_id) return null;

  return {
    stripeCustomerId: firstHour.stripe_customer_id,
    stripePaymentMethodId: firstHour.stripe_payment_method_id,
    providerStripeAccountId: provider.stripe_account_id,
  };
}

async function loadReviewableInvoice(bookingId: string, userId: string) {
  const supabase = await createClient();
  const { data: booking } = await supabase
    .from("bookings")
    .select("id, customer_id, provider_id, booking_flow, status")
    .eq("id", bookingId)
    .maybeSingle();
  if (!booking || booking.customer_id !== userId) {
    return { error: "Booking not found." as const };
  }
  if (!["hourly_v1", "quote_v2"].includes(booking.booking_flow)) {
    return { error: "This booking doesn’t use post-job payment." as const };
  }
  if (booking.status !== "invoice_review") {
    return { error: "This booking isn’t awaiting payment review." as const };
  }
  const { data: invoice } = await supabase
    .from("booking_invoices")
    .select("id, status, remaining_balance_cents, tip_cents")
    .eq("booking_id", bookingId)
    .maybeSingle();
  if (!invoice) return { error: "That invoice no longer exists." as const };
  return { booking, invoice };
}

/**
 * Confirm & pay the remaining balance now (Phase 5). A zero balance settles
 * with no charge. Otherwise the saved method is confirmed one-click on-session;
 * only when the bank requires authentication do we return a client secret for
 * the Payment Element. The booking flips to `completed` from the webhook.
 */
export async function confirmInvoiceBalance(
  _prev: InvoicePayState,
  formData: FormData,
): Promise<InvoicePayState> {
  // Existing jobs remain finishable while new requests are rolled back.
  const user = await requireUser();
  const bookingId = z.string().uuid().parse(formData.get("bookingId"));
  // The tip is optional by design: a missing or unparseable value is no tip.
  const tipCents = normalizeTipCents(formData.get("tipCents"));

  const loaded = await loadReviewableInvoice(bookingId, user.id);
  if ("error" in loaded) return { error: loaded.error };
  const { booking, invoice } = loaded;

  const supabase = await createClient();
  const admin = createAdminClient();

  // A tip on an otherwise-settled invoice is still a real charge, so only a
  // genuinely zero total takes the no-Stripe path.
  if (invoice.remaining_balance_cents === 0 && tipCents === 0) {
    const { error } = await supabase.rpc("settle_zero_balance_invoice", {
      p_invoice_id: invoice.id,
    });
    if (error) {
      return { error: requestOperationMessage(error, "Could not complete the job.") };
    }
    revalidatePath("/dashboard");
    return { settled: true };
  }

  const { data: begun, error: beginError } = await supabase
    .rpc("begin_balance_payment", {
      p_invoice_id: invoice.id,
      p_tip_cents: tipCents,
    })
    .maybeSingle();
  if (beginError || !begun) {
    return {
      error: requestOperationMessage(beginError, "Could not start the payment. Try again."),
    };
  }

  const saved = await loadSavedMethod(booking.id, booking.provider_id);
  if (!saved || !saved.stripePaymentMethodId) {
    return { unconfigured: true };
  }

  // Create unconfirmed, attach, THEN confirm — the settlement webhook can win
  // a race against the attach, and an unattached success strands the invoice.
  const intent = await createBalancePaymentIntent({
    invoiceId: invoice.id,
    bookingId: booking.id,
    amountCents: begun.amount_cents,
    stripeCustomerId: saved.stripeCustomerId,
    stripePaymentMethodId: saved.stripePaymentMethodId,
    providerStripeAccountId: saved.providerStripeAccountId,
    idempotencyKey: begun.idempotency_key,
  });
  if (!intent.configured) return { unconfigured: true };

  const { error: attachError } = await supabase.rpc(
    "attach_balance_payment_intent",
    {
      p_invoice_id: invoice.id,
      p_stripe_payment_intent_id: intent.paymentIntentId,
    },
  );
  if (attachError) {
    // Nothing was confirmed, so no money moved; the retry reuses this intent.
    return {
      error: requestOperationMessage(attachError, "Could not record the payment. Try again."),
    };
  }

  const confirmed = await confirmBalancePaymentIntent({
    paymentIntentId: intent.paymentIntentId,
    offSession: false,
  });
  if (!confirmed.configured) return { unconfigured: true };

  if (confirmed.status === "succeeded" || confirmed.status === "processing") {
    revalidatePath("/dashboard");
    return { processing: true };
  }
  if (confirmed.status === "requires_action") {
    return { clientSecret: confirmed.clientSecret ?? undefined };
  }

  // Hard decline: record it so the invoice becomes recoverable, then surface it.
  await admin.rpc("mark_balance_payment_unsuccessful", {
    p_stripe_payment_intent_id: confirmed.paymentIntentId,
    p_target_status: "failed",
    p_failure_code: confirmed.status,
    p_failure_message: "The card was declined.",
  });
  revalidatePath(`/bookings/${booking.id}/invoice`);
  return { error: "Your card was declined. Try another payment method below." };
}

/**
 * Recover a failed / action-required balance charge. Resets the attempt (new
 * idempotency key, cleared stale intent) and returns an unconfirmed intent so
 * the Payment Element can re-authenticate the saved method or collect a new one.
 */
export async function recoverInvoicePayment(
  _prev: InvoicePayState,
  formData: FormData,
): Promise<InvoicePayState> {
  // Recovery is lifecycle completion, not new booking creation.
  const user = await requireUser();
  const bookingId = z.string().uuid().parse(formData.get("bookingId"));

  const loaded = await loadReviewableInvoice(bookingId, user.id);
  if ("error" in loaded) return { error: loaded.error };
  const { booking, invoice } = loaded;
  if (invoice.remaining_balance_cents + invoice.tip_cents === 0) {
    return { error: "There’s no remaining balance to pay." };
  }

  const supabase = await createClient();
  // Omitting p_tip_cents keeps the tip the customer already chose, so recovery
  // re-charges exactly what they authorized.
  const { data: reset, error: resetError } = await supabase
    .rpc("reset_balance_payment_for_retry", { p_invoice_id: invoice.id })
    .maybeSingle();
  if (resetError || !reset) {
    return {
      error: requestOperationMessage(resetError, "Could not restart the payment. Try again."),
    };
  }

  const saved = await loadSavedMethod(booking.id, booking.provider_id);
  if (!saved) return { unconfigured: true };

  const intent = await createBalancePaymentIntent({
    invoiceId: invoice.id,
    bookingId: booking.id,
    amountCents: reset.amount_cents,
    stripeCustomerId: saved.stripeCustomerId,
    providerStripeAccountId: saved.providerStripeAccountId,
    idempotencyKey: reset.idempotency_key,
  });
  if (!intent.configured) return { unconfigured: true };

  await supabase.rpc("attach_balance_payment_intent", {
    p_invoice_id: invoice.id,
    p_stripe_payment_intent_id: intent.paymentIntentId,
  });

  return { clientSecret: intent.clientSecret ?? undefined };
}
