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
