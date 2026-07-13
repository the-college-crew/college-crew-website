"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { requireUser } from "@/lib/auth/session";
import {
  getConversationIdForBooking,
  getInquiryConversationId,
} from "@/lib/messaging/conversation";
import { createClient } from "@/lib/supabase/server";

/**
 * Shared messaging entry point (used from both dashboards). One conversation per
 * booking, so a second job with the same person is a second thread.
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

  const conversationId = await getConversationIdForBooking(supabase, {
    bookingId: booking.id,
    customerId: booking.customer_id,
    providerId: booking.provider_id,
  });

  redirect(`/messages/${conversationId}`);
}

/**
 * Pre-booking chat: open (or return to) the inquiry thread with a provider
 * straight from their public profile — no booking required. There's at most one
 * of these per pair, and the customer's next booking request with this provider
 * claims it, so the chat and the job it led to stay together. Every message
 * still flows through the moderate-message function.
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

  const conversationId = await getInquiryConversationId(supabase, {
    customerId: user.id,
    providerId: provider.id,
  });

  redirect(`/messages/${conversationId}`);
}
