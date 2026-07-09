"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { requireUser } from "@/lib/auth/session";
import { getOrCreateConversationId } from "@/lib/messaging/conversation";
import { createClient } from "@/lib/supabase/server";

/**
 * Shared messaging entry point (used from both dashboards). Pilot decision:
 * chat opens only from an existing booking. One conversation per
 * customer+provider pair — the booking that opened it is recorded on the
 * thread.
 */
export async function openConversationForBooking(formData: FormData) {
  await requireUser();

  const bookingId = z.string().uuid().parse(formData.get("bookingId"));
  const supabase = await createClient();

  // RLS scopes this to bookings the caller participates in.
  const { data: booking } = await supabase
    .from("bookings")
    .select("id, customer_id, provider_id")
    .eq("id", bookingId)
    .maybeSingle();
  if (!booking) {
    throw new Error("Booking not found.");
  }

  const conversationId = await getOrCreateConversationId(supabase, {
    customerId: booking.customer_id,
    providerId: booking.provider_id,
    bookingId: booking.id,
  });

  redirect(`/messages/${conversationId}`);
}

/**
 * Pre-booking chat: open (or return to) the thread with a provider straight
 * from their public profile — no booking required. The schema already allows
 * booking-less conversations, and every message still flows through the
 * moderate-message function.
 */
export async function openConversationWithProvider(formData: FormData) {
  const providerId = z.string().uuid().parse(formData.get("providerId"));
  const user = await requireUser(`/providers/${providerId}`);
  const supabase = await createClient();

  // Only approved providers are messageable — same bar as booking them.
  const { data: provider } = await supabase
    .from("provider_profiles")
    .select("id, verification_status")
    .eq("id", providerId)
    .eq("verification_status", "approved")
    .maybeSingle();
  if (!provider) {
    throw new Error("Provider not found.");
  }

  const conversationId = await getOrCreateConversationId(supabase, {
    customerId: user.id,
    providerId: provider.id,
  });

  redirect(`/messages/${conversationId}`);
}
