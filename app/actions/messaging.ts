"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { requireUser } from "@/lib/auth/session";
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

  const { data: existing } = await supabase
    .from("conversations")
    .select("id")
    .eq("customer_id", booking.customer_id)
    .eq("provider_id", booking.provider_id)
    .maybeSingle();
  if (existing) {
    redirect(`/messages/${existing.id}`);
  }

  const { data: created, error } = await supabase
    .from("conversations")
    .insert({
      customer_id: booking.customer_id,
      provider_id: booking.provider_id,
      booking_id: booking.id,
    })
    .select("id")
    .single();

  if (error?.code === "23505") {
    // Unique(customer, provider) race — the thread appeared meanwhile.
    const { data: raced } = await supabase
      .from("conversations")
      .select("id")
      .eq("customer_id", booking.customer_id)
      .eq("provider_id", booking.provider_id)
      .single();
    if (raced) redirect(`/messages/${raced.id}`);
  }
  if (!created) {
    throw new Error("Could not open the conversation.");
  }

  redirect(`/messages/${created.id}`);
}
