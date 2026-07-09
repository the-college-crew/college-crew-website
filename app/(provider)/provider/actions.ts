"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getOwnProviderProfile, requireRole } from "@/lib/auth/session";
import type { BookingStatus } from "@/lib/db/types";
import {
  getOrCreateConversationId,
  sendModeratedMessage,
} from "@/lib/messaging/conversation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { createConnectOnboardingLink } from "@/lib/stripe/connect";

/**
 * Provider-side booking + Stripe actions. Booking updates run as the
 * signed-in user: RLS scopes them to this provider's bookings and the
 * database trigger enforces the state machine — even if this code is wrong.
 */

type ServerClient = Awaited<ReturnType<typeof createClient>>;
type BookingParties = { id: string; customer_id: string; provider_id: string };

async function setBookingStatus(formData: FormData, status: BookingStatus) {
  await requireRole("provider");
  const bookingId = z.string().uuid().parse(formData.get("bookingId"));

  const supabase = await createClient();
  const { error } = await supabase
    .from("bookings")
    .update({ status })
    .eq("id", bookingId);
  if (error) {
    throw new Error(`Could not update the booking: ${error.message}`);
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

/** Find (or open) the conversation for a booking's customer+provider pair. */
function conversationIdFor(supabase: ServerClient, booking: BookingParties) {
  return getOrCreateConversationId(supabase, {
    customerId: booking.customer_id,
    providerId: booking.provider_id,
    bookingId: booking.id,
  });
}

/**
 * Accept a request: confirm the job, open the chat, and drop the provider in
 * it. The confirmation ("does this time/place work?") happens client-side, so
 * reaching here means the provider already said yes. The DB trigger still
 * enforces that only the provider can move requested → accepted.
 */
export async function acceptBooking(formData: FormData) {
  await requireRole("provider");
  const bookingId = z.string().uuid().parse(formData.get("bookingId"));
  const supabase = await createClient();

  const booking = await loadBookingParties(supabase, bookingId);

  const { error } = await supabase
    .from("bookings")
    .update({ status: "accepted" })
    .eq("id", bookingId);
  if (error) {
    throw new Error(`Could not accept the booking: ${error.message}`);
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
export async function declineBooking(formData: FormData) {
  await requireRole("provider");
  const bookingId = z.string().uuid().parse(formData.get("bookingId"));
  const message = z
    .string()
    .trim()
    .min(1, "Add a quick note so the customer knows why.")
    .max(4000)
    .parse(formData.get("message"));
  const supabase = await createClient();

  const booking = await loadBookingParties(supabase, bookingId);

  const { error } = await supabase
    .from("bookings")
    .update({ status: "declined" })
    .eq("id", bookingId);
  if (error) {
    throw new Error(`Could not decline the booking: ${error.message}`);
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
  await setBookingStatus(formData, "completed");
}

/**
 * Post-approval "Connect Stripe" (SPEC §6): hosted Express onboarding.
 * While the Stripe test account is unprovisioned this lands back on the
 * dashboard with a pending notice.
 */
export async function connectStripe() {
  await requireRole("provider");
  const profile = await getOwnProviderProfile();
  if (!profile || profile.verification_status !== "approved") {
    redirect("/provider/dashboard");
  }

  const headerList = await headers();
  const origin =
    headerList.get("origin") ??
    `https://${headerList.get("host") ?? "localhost:3000"}`;

  const result = await createConnectOnboardingLink({
    stripeAccountId: profile.stripe_account_id,
    refreshUrl: `${origin}/provider/dashboard?stripe=refresh`,
    returnUrl: `${origin}/provider/settings?stripe=connected`,
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
