"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import {
  getOwnProviderProfile,
  requireProviderAccess,
} from "@/lib/auth/session";
import { requestOperationMessage } from "@/lib/booking/requests";
import type { BookingStatus } from "@/lib/db/types";
import {
  hasAcceptedCurrentLegalDocument,
  legalDocumentPath,
} from "@/lib/legal/acceptance";
import {
  getConversationIdForBooking,
  sendModeratedMessage,
} from "@/lib/messaging/conversation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { createConnectOnboardingLink } from "@/lib/stripe/connect";
import { syncProviderPayoutSnapshot } from "@/lib/provider/payout-readiness";

/**
 * Provider-side booking + Stripe actions. Booking updates run as the
 * signed-in user: RLS scopes them to this provider's bookings and the
 * database trigger enforces the state machine — even if this code is wrong.
 */

type ServerClient = Awaited<ReturnType<typeof createClient>>;
type BookingParties = { id: string; customer_id: string; provider_id: string };

async function transitionLegacyBooking(
  formData: FormData,
  status: Extract<BookingStatus, "completed">,
) {
  await requireProviderAccess();
  const bookingId = z.string().uuid().parse(formData.get("bookingId"));

  const supabase = await createClient();
  const { error } = await supabase.rpc("transition_legacy_booking", {
    p_booking_id: bookingId,
    p_target_status: status,
  });
  if (error) {
    throw new Error(requestOperationMessage(error));
  }

  revalidatePath("/provider/dashboard");
  revalidatePath("/provider/jobs");
}

/** Load a booking's parties. RLS scopes this to bookings the caller is in. */
async function loadBookingParties(
  supabase: ServerClient,
  bookingId: string,
): Promise<BookingParties> {
  const { data: booking } = await supabase
    .from("bookings")
    .select("id, customer_id, provider_id")
    .eq("id", bookingId)
    .maybeSingle();
  if (!booking) throw new Error("Booking not found.");
  return booking as BookingParties;
}

/** Find (or open) this booking's own conversation. */
function conversationIdFor(supabase: ServerClient, booking: BookingParties) {
  return getConversationIdForBooking(supabase, {
    bookingId: booking.id,
    customerId: booking.customer_id,
    providerId: booking.provider_id,
  });
}

/**
 * Accept a request: confirm the job, open the chat, and drop the provider in
 * it. The confirmation ("does this time/place work?") happens client-side, so
 * reaching here means the provider already said yes. The DB trigger still
 * enforces that only the provider can move requested → accepted.
 */
export type BookingRequestActionState = { error?: string };

export async function acceptBooking(
  _previous: BookingRequestActionState,
  formData: FormData,
): Promise<BookingRequestActionState> {
  const session = await requireProviderAccess();
  const bookingId = z.string().uuid().parse(formData.get("bookingId"));
  const supabase = await createClient();

  if (
    !(await hasAcceptedCurrentLegalDocument(supabase, {
      userId: session.user.id,
      kind: "platform_terms",
    }))
  ) {
    redirect(legalDocumentPath("platform_terms", "/provider/dashboard"));
  }
  if (
    !(await hasAcceptedCurrentLegalDocument(supabase, {
      userId: session.user.id,
      kind: "provider_terms",
    }))
  ) {
    redirect(legalDocumentPath("provider_terms", "/provider/dashboard"));
  }

  const booking = await loadBookingParties(supabase, bookingId);

  const { error } = await supabase.rpc("accept_booking_request", {
    p_booking_id: bookingId,
  });
  if (error) {
    return {
      error: requestOperationMessage(error, "Could not accept the request."),
    };
  }

  const conversationId = await conversationIdFor(supabase, booking);

  revalidatePath("/provider/dashboard");
  revalidatePath("/provider/jobs");
  redirect(`/messages/${conversationId}`);
}

/**
 * Decline a request with a note (e.g. "can't do that time — Saturday?"). The
 * note becomes the opening message of the chat so the customer can counter.
 * It goes through the moderate-message function like any other message — never
 * a direct insert — so contact-info scanning still applies.
 */
export async function declineBooking(
  _previous: BookingRequestActionState,
  formData: FormData,
): Promise<BookingRequestActionState> {
  await requireProviderAccess();
  const bookingId = z.string().uuid().parse(formData.get("bookingId"));
  const message = z
    .string()
    .trim()
    .min(1, "Add a quick note so the customer knows why.")
    .max(4000)
    .parse(formData.get("message"));
  const supabase = await createClient();

  const booking = await loadBookingParties(supabase, bookingId);

  const { error } = await supabase.rpc("decline_booking_request", {
    p_booking_id: bookingId,
  });
  if (error) {
    return {
      error: requestOperationMessage(error, "Could not decline the request."),
    };
  }

  const conversationId = await conversationIdFor(supabase, booking);

  // The provider's note becomes the opening message so the customer can
  // counter — sent through moderation like any other message.
  const sent = await sendModeratedMessage(supabase, conversationId, message);
  if (!sent) {
    throw new Error(
      "Declined — but the note didn't send. Open the chat to message the customer.",
    );
  }

  revalidatePath("/provider/dashboard");
  revalidatePath("/provider/jobs");
  redirect(`/messages/${conversationId}`);
}

export async function completeBooking(formData: FormData) {
  await transitionLegacyBooking(formData, "completed");
}

/**
 * Hourly Booking v1 (Phase 6): the assigned provider cancels a booked/accepted
 * job before Arrived, with a required reason. cancel_booking_as_provider always
 * fully refunds a captured first hour (recorded there); we execute that refund
 * here. After a paid cancellation the customer is offered optional replacements
 * on the cancelled booking's page — no auto-rebooking.
 */
export async function cancelBookingAsProvider(
  _previous: BookingRequestActionState,
  formData: FormData,
): Promise<BookingRequestActionState> {
  await requireProviderAccess();
  const bookingId = z.string().uuid().parse(formData.get("bookingId"));
  const reason = z
    .string()
    .trim()
    .min(3, "Add a short reason for cancelling.")
    .max(500)
    .parse(formData.get("reason"));

  const supabase = await createClient();
  const { data: result, error } = await supabase.rpc(
    "cancel_booking_as_provider",
    { p_booking_id: bookingId, p_reason: reason },
  );
  if (error) {
    return {
      error: requestOperationMessage(error, "Could not cancel the job."),
    };
  }

  // A captured first hour is always refunded on a provider cancellation; the
  // webhook reconciles any Stripe/settle failure, so never block the UI.
  if (result === "full_refund") {
    const { executePendingRefunds } = await import("@/lib/booking/refunds");
    await executePendingRefunds(bookingId);
  }

  revalidatePath("/provider/dashboard");
  revalidatePath("/provider/jobs");
  redirect("/provider/dashboard");
}

/**
 * Hourly Booking v1 (Phase 5): the assigned provider taps Arrived, moving a
 * booked job to in_progress with an immutable server timestamp. The 30-minute
 * grace and provider authorization are enforced by mark_booking_arrived.
 */
export async function markArrived(formData: FormData) {
  await requireProviderAccess();
  const bookingId = z.string().uuid().parse(formData.get("bookingId"));
  const supabase = await createClient();
  const { error } = await supabase.rpc("mark_booking_arrived", {
    p_booking_id: bookingId,
  });
  if (error) {
    throw new Error(requestOperationMessage(error, "Could not mark arrival."));
  }
  revalidatePath("/provider/dashboard");
  revalidatePath("/provider/jobs");
  redirect(`/provider/jobs/${bookingId}/complete`);
}

/** Send the customer one immutable on-my-way update without changing status. */
export async function markEnRoute(formData: FormData) {
  await requireProviderAccess();
  const bookingId = z.string().uuid().parse(formData.get("bookingId"));
  const supabase = await createClient();
  const { error } = await supabase.rpc("mark_booking_en_route", {
    p_booking_id: bookingId,
  });
  if (error) {
    throw new Error(
      requestOperationMessage(error, "Could not notify the customer."),
    );
  }
  revalidatePath("/provider/dashboard");
  revalidatePath("/provider/jobs");
  revalidatePath("/dashboard");
}

/**
 * Job Complete + invoice submission (Phase 5): records work_completed_at and
 * the actual billable time, computes the invoice from the immutable snapshots,
 * and moves in_progress → invoice_review. All money math and bounds live in
 * submit_job_invoice; this only forwards the provider's edited minutes/note.
 */
export async function submitInvoice(
  _previous: BookingRequestActionState,
  formData: FormData,
): Promise<BookingRequestActionState> {
  await requireProviderAccess();
  const bookingId = z.string().uuid().parse(formData.get("bookingId"));
  const submittedMinutes = z.coerce
    .number()
    .int()
    .parse(formData.get("submittedMinutes"));
  const explanation = z.string().max(2000).parse(formData.get("explanation") ?? "");

  const supabase = await createClient();
  const { error } = await supabase.rpc("submit_job_invoice", {
    p_booking_id: bookingId,
    p_submitted_minutes: submittedMinutes,
    p_provider_explanation: explanation,
  });
  if (error) {
    return {
      error: requestOperationMessage(error, "Could not submit the invoice."),
    };
  }
  revalidatePath("/provider/dashboard");
  revalidatePath("/provider/jobs");
  redirect(`/provider/jobs/${bookingId}/complete`);
}

/**
 * Post-approval "Connect Stripe" (SPEC §6): hosted Express onboarding.
 * While the Stripe test account is unprovisioned this lands back on the
 * dashboard with a pending notice.
 */
export async function connectStripe() {
  const session = await requireProviderAccess();
  const profile = await getOwnProviderProfile();
  if (!profile || profile.verification_status !== "approved") {
    redirect("/provider/dashboard");
  }
  const supabase = await createClient();
  if (
    !(await hasAcceptedCurrentLegalDocument(supabase, {
      userId: session.user.id,
      kind: "platform_terms",
    }))
  ) {
    redirect(legalDocumentPath("platform_terms", "/provider/dashboard"));
  }
  if (
    !(await hasAcceptedCurrentLegalDocument(supabase, {
      userId: session.user.id,
      kind: "provider_terms",
    }))
  ) {
    redirect(legalDocumentPath("provider_terms", "/provider/dashboard"));
  }
  // v2 requires a contact email to create the recipient account.
  const contactEmail = session.user.email;
  if (!contactEmail) {
    redirect("/provider/dashboard?stripe=noemail");
  }

  const headerList = await headers();
  const origin =
    headerList.get("origin") ??
    `https://${headerList.get("host") ?? "localhost:3000"}`;

  const result = await createConnectOnboardingLink({
    stripeAccountId: profile.stripe_account_id,
    contactEmail,
    refreshUrl: `${origin}/provider/dashboard?stripe=refresh`,
    returnUrl: `${origin}/provider/stripe/return`,
  });

  if (!result.configured) {
    redirect("/provider/dashboard?stripe=pending");
  }

  // stripe_account_id is server-written only (column grant), so persist it
  // with the service-role client after the ownership checks above.
  if (result.stripeAccountId !== profile.stripe_account_id) {
    const admin = createAdminClient();
    await admin
      .from("provider_profiles")
      .update({ stripe_account_id: result.stripeAccountId })
      .eq("id", profile.id);
  }

  redirect(result.url);
}

/** Provider-triggered capability refresh for delayed Stripe requirements. */
export async function refreshStripeReadiness() {
  await requireProviderAccess();
  const profile = await getOwnProviderProfile();
  if (!profile?.stripe_account_id) return;

  await syncProviderPayoutSnapshot(profile);
  revalidatePath("/account");
  revalidatePath("/provider/dashboard");
  revalidatePath("/browse");
  revalidatePath(`/providers/${profile.id}`);
}
