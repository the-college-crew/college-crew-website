"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireRole } from "@/lib/auth/session";
import { executePendingRefunds } from "@/lib/booking/refunds";
import { requestOperationMessage } from "@/lib/booking/requests";
import { hasServiceRoleEnv } from "@/lib/env";
import { createBalancePaymentIntent } from "@/lib/stripe/connect";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const RESOLUTIONS = [
  "approve_submitted_hours",
  "reduce_billable_minutes",
  "waive_remaining_balance",
  "cancel_and_refund",
] as const;

const resolveSchema = z.object({
  bookingId: z.string().uuid(),
  resolutionKind: z.enum(RESOLUTIONS),
  auditNote: z.string().trim().min(1, "Add a resolution note.").max(2000),
  resolvedBillableMinutes: z.coerce.number().int().optional(),
});

export type ResolveState = {
  error?: string;
  success?: string;
  /** A resolution that charges may need customer re-authentication (recovery). */
  recovery?: boolean;
};

/**
 * Founder resolution (Phase 6). resolve_booking_dispute records the audited
 * decision and returns a directive; this executes the Stripe side. Admin is
 * re-checked in the RPC body and here. The admin form can never supply cents,
 * account ids, or Stripe ids — only the booking, the resolution, the note, and
 * (for a reduction) the new whole-quarter-hour minutes.
 */
export async function resolveDispute(
  _previous: ResolveState,
  formData: FormData,
): Promise<ResolveState> {
  await requireRole("admin");

  const parsed = resolveSchema.safeParse({
    bookingId: formData.get("bookingId"),
    resolutionKind: formData.get("resolutionKind"),
    auditNote: formData.get("auditNote"),
    resolvedBillableMinutes: formData.get("resolvedBillableMinutes") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form." };
  }
  const { bookingId, resolutionKind, auditNote, resolvedBillableMinutes } =
    parsed.data;

  const supabase = await createClient();
  const { data: directive, error } = await supabase
    .rpc("resolve_booking_dispute", {
      p_booking_id: bookingId,
      p_resolution_kind: resolutionKind,
      p_audit_note: auditNote,
      p_resolved_billable_minutes:
        resolutionKind === "reduce_billable_minutes"
          ? (resolvedBillableMinutes ?? undefined)
          : undefined,
    })
    .maybeSingle();
  if (error || !directive) {
    return {
      error: requestOperationMessage(error, "Could not resolve the dispute."),
    };
  }

  const revalidate = () => {
    revalidatePath(`/admin/bookings/${bookingId}`);
    revalidatePath("/admin/disputes");
  };

  if (directive.outcome === "refund_required") {
    await executePendingRefunds(bookingId);
    revalidate();
    return { success: "Resolved — refund issued to the customer." };
  }

  if (directive.outcome === "charge_required") {
    const recovery = await chargeResolvedBalance({
      bookingId,
      invoiceId: directive.invoice_id,
      amountCents: directive.charge_amount_cents ?? 0,
      applicationFeeCents: directive.charge_application_fee_cents ?? 0,
      idempotencyKey: directive.charge_idempotency_key ?? "",
    });
    revalidate();
    return recovery
      ? {
          success: "Resolved — the balance charge needs customer action.",
          recovery: true,
        }
      : { success: "Resolved — the balance was charged." };
  }

  revalidate();
  return { success: "Resolved." };
}

/**
 * Off-session balance charge for an approved/reduced resolution. Mirrors the
 * scheduled-autocharge path: read the saved method + connected account with the
 * admin client, confirm off-session, and record the outcome. Booking completion
 * comes from settle_balance_payment via the webhook. Returns true when the
 * charge needs recovery (auth required / declined).
 */
async function chargeResolvedBalance(input: {
  bookingId: string;
  invoiceId: string | null;
  amountCents: number;
  applicationFeeCents: number;
  idempotencyKey: string;
}): Promise<boolean> {
  if (!hasServiceRoleEnv() || !input.invoiceId || input.amountCents <= 0) {
    return true;
  }
  const admin = createAdminClient();

  const [{ data: firstHour }, { data: booking }] = await Promise.all([
    admin
      .from("booking_payments")
      .select("stripe_customer_id, stripe_payment_method_id")
      .eq("booking_id", input.bookingId)
      .eq("kind", "first_hour")
      .maybeSingle(),
    admin
      .from("bookings")
      .select("provider_id")
      .eq("id", input.bookingId)
      .maybeSingle(),
  ]);
  if (!firstHour?.stripe_customer_id || !firstHour.stripe_payment_method_id) {
    return true;
  }
  const { data: provider } = await admin
    .from("provider_profiles")
    .select("stripe_account_id")
    .eq("id", booking?.provider_id ?? "")
    .maybeSingle();
  if (!provider?.stripe_account_id) return true;

  const intent = await createBalancePaymentIntent({
    invoiceId: input.invoiceId,
    bookingId: input.bookingId,
    amountCents: input.amountCents,
    applicationFeeCents: input.applicationFeeCents,
    stripeCustomerId: firstHour.stripe_customer_id,
    stripePaymentMethodId: firstHour.stripe_payment_method_id,
    providerStripeAccountId: provider.stripe_account_id,
    idempotencyKey: input.idempotencyKey,
    confirm: true,
    offSession: true,
  });
  if (!intent.configured) return true;

  await admin.rpc("attach_balance_payment_intent", {
    p_invoice_id: input.invoiceId,
    p_stripe_payment_intent_id: intent.paymentIntentId,
  });

  // Success/processing → the webhook completes the booking. Anything else is a
  // recovery state recorded on the payment/invoice for a customer retry.
  if (intent.status === "succeeded" || intent.status === "processing") {
    return false;
  }
  await admin.rpc("mark_balance_payment_unsuccessful", {
    p_stripe_payment_intent_id: intent.paymentIntentId,
    p_target_status:
      intent.status === "requires_action" ? "requires_action" : "failed",
    p_failure_code: intent.status,
    p_failure_message: "The resolution charge needs customer authentication.",
  });
  return true;
}
