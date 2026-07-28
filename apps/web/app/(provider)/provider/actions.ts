"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import {
  getOwnProviderProfile,
  requireProviderAccess,
} from "@/lib/auth/session";
import {
  captureFirstHourHold,
  releaseFirstHourHold,
} from "@/lib/booking/first-hour-hold";
import { pilotLocalDateTimeToUtc } from "@/lib/booking/policy";
import { QUOTE_DAYPARTS } from "@/lib/booking/quote-dayparts";
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
import { parseAverageQuoteInput } from "@/lib/provider/setup";
import { formatMoney } from "@/lib/utils";

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

/** Clear a customer-cancellation notice from the provider's Jobs queue. */
export async function dismissCustomerCancellationNotice(formData: FormData) {
  await requireProviderAccess();
  const bookingId = z.string().uuid().parse(formData.get("bookingId"));
  const supabase = await createClient();
  const { error } = await supabase.rpc(
    "dismiss_provider_customer_cancellation_notice",
    { p_booking_id: bookingId },
  );

  if (error) {
    throw new Error(requestOperationMessage(error, "Could not dismiss the notice."));
  }

  revalidatePath("/provider/jobs");
}

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
    // Log the raw DB error so an unmapped failure (e.g. a stale check
    // constraint) surfaces instead of hiding behind the generic fallback.
    console.error("[accept] accept_booking_request failed", {
      bookingId,
      message: error.message,
    });
    return {
      error: requestOperationMessage(error, "Could not accept the request."),
    };
  }

  // Capture the first-hour hold placed at request time. The webhook advances
  // accepted → booked once Stripe confirms the capture; a rare failure is
  // reconciled there, so never block the acceptance on it.
  try {
    await captureFirstHourHold(bookingId);
  } catch (captureError) {
    console.error("[accept] first-hour capture failed", captureError);
  }

  const conversationId = await conversationIdFor(supabase, booking);

  revalidatePath("/provider/dashboard");
  revalidatePath("/provider/jobs");
  redirect(`/messages/${conversationId}`);
}

/**
 * Close the job out as paid in person. The platform does NOT charge the job
 * amount — it keeps only its rake from the first hour it already captured and
 * pays the student the remainder through the ordinary payout job.
 *
 * `confirmed` is the whole control on this path: it is the only record that the
 * customer actually handed money over off-platform, so the RPC refuses without
 * it rather than trusting the UI to have asked.
 */
const cashSchema = z.object({
  bookingId: z.string().uuid(),
  submittedMinutes: z.coerce.number().int(),
  explanation: z.string().max(2000).optional().default(""),
  confirmed: z.literal("on", {
    message: "Confirm the customer paid you in person.",
  }),
});

export async function settleJobInCash(
  _previous: BookingRequestActionState,
  formData: FormData,
): Promise<BookingRequestActionState> {
  await requireProviderAccess();
  const parsed = cashSchema.safeParse({
    bookingId: formData.get("bookingId"),
    submittedMinutes: formData.get("submittedMinutes"),
    explanation: formData.get("explanation") ?? "",
    confirmed: formData.get("confirmed"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { error } = await supabase.rpc("settle_job_in_cash", {
    p_booking_id: parsed.data.bookingId,
    p_submitted_minutes: parsed.data.submittedMinutes,
    p_provider_explanation: parsed.data.explanation,
    p_confirmed: true,
  });
  if (error) {
    return {
      error: requestOperationMessage(error, "Could not record the cash payment."),
    };
  }

  revalidatePath("/provider/dashboard");
  revalidatePath("/provider/jobs");
  redirect(`/provider/jobs/${parsed.data.bookingId}/complete`);
}

/**
 * Suggest a different start time instead of accepting or declining. Only offered
 * when the customer chose "they can suggest a different time" — the RPC enforces
 * that, re-validates availability/notice/conflicts at the proposed slot, and
 * emails the customer. The booking's rate snapshot and its first-hour hold are
 * untouched: a counter moves the time only, and the provider does not change, so
 * the existing hold stays valid and is captured if the customer accepts.
 */
const counterSchema = z.object({
  bookingId: z.string().uuid(),
  proposedLocal: z.string().min(1, "Pick the time you can do."),
  note: z.string().trim().max(500).optional().default(""),
});

export async function counterBooking(
  _previous: BookingRequestActionState,
  formData: FormData,
): Promise<BookingRequestActionState> {
  await requireProviderAccess();
  const parsed = counterSchema.safeParse({
    bookingId: formData.get("bookingId"),
    proposedLocal: formData.get("proposedLocal"),
    note: formData.get("note"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const proposed = pilotLocalDateTimeToUtc(parsed.data.proposedLocal);
  if (!proposed.ok) return { error: "Pick a valid date and time." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("counter_hourly_booking_request", {
    p_booking_id: parsed.data.bookingId,
    p_proposed_start_at: proposed.date.toISOString(),
    p_note: parsed.data.note,
  });
  if (error) {
    return {
      error: requestOperationMessage(error, "Could not suggest a new time."),
    };
  }

  revalidatePath("/provider/dashboard");
  return {};
}

/**
 * Start a scheduling conversation for a flexible hourly request. Unlike the
 * quote counter flow, this deliberately does not alter the booking's requested
 * time or status: the pilot's lightweight path is for both people to agree on
 * a new time in their existing, moderated booking thread.
 */
export async function suggestAnotherTime(
  _previous: BookingRequestActionState,
  formData: FormData,
): Promise<BookingRequestActionState> {
  await requireProviderAccess();
  const bookingId = z.string().uuid().parse(formData.get("bookingId"));
  const supabase = await createClient();

  const booking = await loadBookingParties(supabase, bookingId);
  const rpc = supabase.rpc.bind(supabase) as unknown as (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<{ error: { message: string } | null }>;
  const { error: startError } = await rpc("start_hourly_chat_rescheduling", {
    p_booking_id: bookingId,
  });
  if (startError) {
    return {
      error: requestOperationMessage(
        startError,
        "This request can no longer be discussed as a time change.",
      ),
    };
  }

  const conversationId = await conversationIdFor(supabase, booking);
  const sent = await sendModeratedMessage(
    supabase,
    conversationId,
    "Hi! I’m not available at the requested time. Could we find another date and time that works for both of us?",
  );
  if (!sent) {
    return {
      error: "Couldn’t start the scheduling conversation. Please try again.",
    };
  }

  revalidatePath("/provider/dashboard");
  redirect(`/messages/${conversationId}`);
}

const quoteChatRescheduleSchema = z.object({
  bookingId: z.string().uuid(),
  estimatedMinutes: z.coerce.number().int().min(60).max(720)
    .refine((value) => value % 15 === 0, "Use 15-minute increments."),
});

/** Start quote scheduling in chat after the provider sets its fixed quote and estimate. */
export async function suggestQuoteAnotherTime(
  _previous: BookingRequestActionState,
  formData: FormData,
): Promise<BookingRequestActionState> {
  await requireProviderAccess();
  const parsed = quoteChatRescheduleSchema.safeParse({
    bookingId: formData.get("bookingId"),
    estimatedMinutes: formData.get("estimatedMinutes"),
  });
  const quote = parseAverageQuoteInput(formData.get("quoteAmount"));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  if (!quote.success || quote.cents === null) {
    return { error: quote.success ? "Enter a final quote between $20 and $10,000." : "Enter a final quote." };
  }
  const supabase = await createClient();
  const booking = await loadBookingParties(supabase, parsed.data.bookingId);
  const rpc = supabase.rpc.bind(supabase) as unknown as (
    name: string, args: Record<string, unknown>,
  ) => Promise<{ error: { message: string } | null }>;
  const { error } = await rpc("start_quote_chat_rescheduling", {
    p_booking_id: parsed.data.bookingId,
    p_quote_cents: quote.cents,
    p_estimated_minutes: parsed.data.estimatedMinutes,
  });
  if (error) {
    console.error("[quote-chat-reschedule] start failed", {
      bookingId: parsed.data.bookingId,
      message: error.message,
    });
    return { error: requestOperationMessage(error, "Could not start quote scheduling.") };
  }
  const conversationId = await conversationIdFor(supabase, booking);
  const sent = await sendModeratedMessage(
    supabase,
    conversationId,
    `I can do this for ${formatMoney(quote.cents)} and estimate ${Math.floor(parsed.data.estimatedMinutes / 60)} hour${Math.floor(parsed.data.estimatedMinutes / 60) === 1 ? "" : "s"}${parsed.data.estimatedMinutes % 60 ? ` ${parsed.data.estimatedMinutes % 60} minutes` : ""}. Could we find a date and start time that works for both of us?`,
  );
  if (!sent) return { error: "Couldn’t start the scheduling conversation. Please try again." };
  revalidatePath("/provider/dashboard");
  redirect(`/messages/${conversationId}`);
}

/**
 * Send the assigned request's one final flat quote. The RPC atomically
 * snapshots the amount, reserves the slot, and moves requested to accepted.
 * A plain-language chat message is added after commit so both parties can see
 * the quoted amount in the same thread used for photos and video.
 */
export async function sendQuote(
  _previous: BookingRequestActionState,
  formData: FormData,
): Promise<BookingRequestActionState> {
  const session = await requireProviderAccess();
  const bookingId = z.string().uuid().parse(formData.get("bookingId"));
  const schedule = z
    .object({
      scheduledLocal: z.string().min(1, "Choose the exact start time."),
      estimatedMinutes: z.coerce
        .number()
        .int()
        .min(60)
        .max(720)
        .refine((value) => value % 15 === 0, "Use 15-minute increments."),
    })
    .safeParse({
      scheduledLocal: formData.get("scheduledLocal"),
      estimatedMinutes: formData.get("estimatedMinutes"),
    });
  if (!schedule.success) return { error: schedule.error.issues[0].message };
  const scheduled = pilotLocalDateTimeToUtc(schedule.data.scheduledLocal);
  if (!scheduled.ok) return { error: "Choose a valid exact start time." };
  const parsedQuote = parseAverageQuoteInput(formData.get("quoteAmount"));
  if (!parsedQuote.success || parsedQuote.cents === null) {
    return {
      error: parsedQuote.success
        ? "Enter the final flat quote."
        : "Enter a final quote between $20 and $10,000.",
    };
  }

  const supabase = await createClient();
  for (const kind of ["platform_terms", "provider_terms"] as const) {
    if (
      !(await hasAcceptedCurrentLegalDocument(supabase, {
        userId: session.user.id,
        kind,
      }))
    ) {
      redirect(legalDocumentPath(kind, "/provider/dashboard"));
    }
  }

  const booking = await loadBookingParties(supabase, bookingId);
  const { error } = await supabase.rpc("send_booking_quote", {
    p_booking_id: bookingId,
    p_quote_cents: parsedQuote.cents,
    p_scheduled_at: scheduled.date.toISOString(),
    p_estimated_minutes: schedule.data.estimatedMinutes,
  });
  if (error) {
    return {
      error: requestOperationMessage(error, "Could not send the quote."),
    };
  }

  const conversationId = await conversationIdFor(supabase, booking);
  await sendModeratedMessage(
    supabase,
    conversationId,
    `Final flat quote: ${formatMoney(parsedQuote.cents)}. Review the full booking details and confirm payment when you are ready.`,
  );

  revalidatePath("/provider/dashboard");
  revalidatePath("/provider/jobs");
  revalidatePath("/dashboard");
  redirect(`/messages/${conversationId}`);
}

const quoteCounterSchema = z.object({
  bookingId: z.string().uuid(),
  estimatedMinutes: z.coerce
    .number()
    .int()
    .min(60, "Estimate at least one hour.")
    .max(720, "Estimate no more than 12 hours.")
    .refine((value) => value % 15 === 0, "Use 15-minute increments."),
  note: z.string().trim().max(500).optional().default(""),
  options: z
    .array(
      z.object({
        localDate: z.string().date(),
        daypart: z.enum(QUOTE_DAYPARTS),
      }),
    )
    .min(1, "Offer at least one alternative.")
    .max(3, "Offer no more than three alternatives."),
});

export async function counterQuote(
  _previous: BookingRequestActionState,
  formData: FormData,
): Promise<BookingRequestActionState> {
  await requireProviderAccess();
  let options: unknown = null;
  try {
    options = JSON.parse(String(formData.get("options") ?? ""));
  } catch {
    return { error: "Add at least one valid alternative." };
  }
  const parsed = quoteCounterSchema.safeParse({
    bookingId: formData.get("bookingId"),
    estimatedMinutes: formData.get("estimatedMinutes"),
    note: formData.get("note"),
    options,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { error } = await supabase.rpc("counter_quote_booking_request", {
    p_booking_id: parsed.data.bookingId,
    p_estimated_minutes: parsed.data.estimatedMinutes,
    p_options: parsed.data.options,
    p_note: parsed.data.note,
  });
  if (error) {
    return {
      error: requestOperationMessage(error, "Could not send those alternatives."),
    };
  }
  revalidatePath("/provider/dashboard");
  revalidatePath("/dashboard");
  return {};
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

  // Release the first-hour hold so the customer is never charged for a declined
  // request. Best-effort — the payment_intent.canceled webhook reconciles it.
  try {
    await releaseFirstHourHold(bookingId);
  } catch (releaseError) {
    console.error("[decline] first-hour release failed", releaseError);
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
  const { data: booking } = await supabase
    .from("bookings")
    .select("booking_flow")
    .eq("id", bookingId)
    .maybeSingle();
  const { data: result, error } = await supabase.rpc(
    booking?.booking_flow === "quote_v2"
      ? "cancel_quote_booking_as_provider"
      : "cancel_booking_as_provider",
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

/** Submit the immutable quote total; no provider-entered amount can change it. */
export async function submitQuoteInvoice(
  _previous: BookingRequestActionState,
  formData: FormData,
): Promise<BookingRequestActionState> {
  await requireProviderAccess();
  const bookingId = z.string().uuid().parse(formData.get("bookingId"));
  const supabase = await createClient();
  const { error } = await supabase.rpc("submit_quote_invoice", {
    p_booking_id: bookingId,
  });
  if (error) {
    return {
      error: requestOperationMessage(error, "Could not submit the quote invoice."),
    };
  }
  revalidatePath("/provider/dashboard");
  revalidatePath("/provider/jobs");
  redirect(`/provider/jobs/${bookingId}/complete`);
}

export async function settleQuoteJobInCash(
  _previous: BookingRequestActionState,
  formData: FormData,
): Promise<BookingRequestActionState> {
  await requireProviderAccess();
  const bookingId = z.string().uuid().parse(formData.get("bookingId"));
  if (formData.get("confirmed") !== "on") {
    return { error: "Confirm the customer paid the remaining balance in person." };
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("settle_quote_job_in_cash", {
    p_booking_id: bookingId,
    p_confirmed: true,
  });
  if (error) {
    return {
      error: requestOperationMessage(error, "Could not record the cash payment."),
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
