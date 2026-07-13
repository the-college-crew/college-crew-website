"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { getSession } from "@/lib/auth/session";
import {
  getConversationIdForBooking,
  sendModeratedMessage,
} from "@/lib/messaging/conversation";
import { areBookingRequestsEnabled } from "@/lib/env";
import { PLATFORM_FEE_RATE } from "@/lib/site";
import { createClient } from "@/lib/supabase/server";

export type BookingFormState = { error?: string };

const bookingSchema = z.object({
  providerId: z.string().uuid(),
  providerServiceId: z.string().uuid("Pick a service."),
  scheduledAt: z
    .string()
    .min(1, "Pick a date and time.")
    .refine((value) => !Number.isNaN(Date.parse(value)), "Pick a valid date.")
    .refine(
      (value) => new Date(value).getTime() > Date.now(),
      "Pick a time in the future.",
    ),
  address: z.string().trim().min(5, "Enter the service address."),
  details: z.string().trim().max(2000).optional().default(""),
});

/**
 * Creates a booking *request* — no charge happens here (SPEC §3:
 * charge-after-acceptance). Price is snapshotted server-side from the
 * provider's published pricing; the client never sets money fields.
 */
export async function createBookingRequest(
  _prev: BookingFormState,
  formData: FormData,
): Promise<BookingFormState> {
  if (!areBookingRequestsEnabled()) {
    return {
      error:
        "New booking requests are temporarily paused while we update scheduling.",
    };
  }

  const session = await getSession();
  if (!session) {
    return { error: "Log in to request a booking." };
  }
  if (session.profile.role !== "customer") {
    return { error: "Only customer accounts can request bookings." };
  }
  // Pilot decision: verified email before booking.
  if (!session.user.email_confirmed_at) {
    return {
      error:
        "Confirm your email first — check your inbox for the confirmation link.",
    };
  }

  const parsed = bookingSchema.safeParse({
    providerId: formData.get("providerId"),
    providerServiceId: formData.get("providerServiceId"),
    scheduledAt: formData.get("scheduledAt"),
    address: formData.get("address"),
    details: formData.get("details"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const supabase = await createClient();

  // Visible via RLS only while the provider is approved.
  const { data: offered } = await supabase
    .from("provider_services")
    .select("id, provider_id, service_id, price_cents, price_type, service:services(is_live)")
    .eq("id", parsed.data.providerServiceId)
    .maybeSingle();

  const service = Array.isArray(offered?.service)
    ? offered.service[0]
    : offered?.service;

  if (
    !offered ||
    offered.provider_id !== parsed.data.providerId ||
    !service?.is_live
  ) {
    return { error: "That service isn't available from this provider." };
  }

  // Quote-priced services start at $0 and get priced in chat — the charge
  // flow for quotes is an open question (SPEC §10); pilot books them at $0.
  const priceCents = offered.price_type === "quote" ? 0 : offered.price_cents;

  const { data: booking, error } = await supabase
    .from("bookings")
    .insert({
      customer_id: session.user.id,
      provider_id: offered.provider_id,
      service_id: offered.service_id,
      scheduled_at: new Date(parsed.data.scheduledAt).toISOString(),
      address: parsed.data.address,
      details: parsed.data.details,
      price_cents: priceCents,
      platform_fee_cents: Math.round(priceCents * PLATFORM_FEE_RATE),
    })
    .select("id")
    .single();
  if (error || !booking) {
    return { error: "Could not send the request — try again." };
  }

  // Open this booking's thread now, even with no note to seed it: resolving the
  // thread here is also what claims any pre-booking inquiry chat with this
  // provider, and doing it at request time means the *first* booking claims it
  // rather than whichever booking's thread happens to be opened first.
  //
  // Then seed the chat with the customer's note so it's the opening message when
  // either party opens the thread. Best-effort throughout: the booking is
  // already made, so a moderation hiccup shouldn't fail the request — the note
  // also stays on the booking card. Sent under the customer's session, so it's
  // attributed to them (the provider may be the one who first opens the thread).
  try {
    const conversationId = await getConversationIdForBooking(supabase, {
      bookingId: booking.id,
      customerId: session.user.id,
      providerId: offered.provider_id,
    });
    if (parsed.data.details) {
      await sendModeratedMessage(supabase, conversationId, parsed.data.details);
    }
  } catch {
    // Non-fatal — the request still went through.
  }

  redirect("/dashboard?requested=1");
}
