"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { getSession } from "@/lib/auth/session";
import { pilotLocalDateTimeToUtc } from "@/lib/booking/policy";
import {
  createHourlyRequest,
  requestOperationMessage,
} from "@/lib/booking/requests";
import { areBookingRequestsEnabled, isHourlyBookingEnabled } from "@/lib/env";
import {
  getConversationIdForBooking,
  sendModeratedMessage,
} from "@/lib/messaging/conversation";
import { createClient } from "@/lib/supabase/server";

export type BookingFormState = { error?: string };

const bookingSchema = z.object({
  providerServiceId: z.string().uuid("Pick a service."),
  scheduledLocal: z.string().min(1, "Pick a date and time."),
  estimatedMinutes: z.coerce.number().int(),
  responseWindowHours: z.coerce.number().int(),
  address: z.string().trim().min(5, "Enter the service address.").max(500),
  jobZip: z.string().trim().regex(/^\d{5}$/, "Enter a five-digit job ZIP."),
  details: z.string().trim().max(2000).optional().default(""),
});

export async function createBookingRequest(
  _prev: BookingFormState,
  formData: FormData,
): Promise<BookingFormState> {
  if (!isHourlyBookingEnabled() || !areBookingRequestsEnabled()) {
    return {
      error:
        "New booking requests are temporarily paused while we update scheduling.",
    };
  }

  const session = await getSession();
  if (!session) return { error: "Log in to request a booking." };
  if (session.profile.role !== "customer") {
    return { error: "Only customer accounts can request bookings." };
  }
  if (!session.user.email_confirmed_at) {
    return { error: "Confirm your email before requesting a booking." };
  }

  const parsed = bookingSchema.safeParse({
    providerServiceId: formData.get("providerServiceId"),
    scheduledLocal: formData.get("scheduledLocal"),
    estimatedMinutes: formData.get("estimatedMinutes"),
    responseWindowHours: formData.get("responseWindowHours"),
    address: formData.get("address"),
    jobZip: formData.get("jobZip"),
    details: formData.get("details"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const scheduled = pilotLocalDateTimeToUtc(parsed.data.scheduledLocal);
  if (!scheduled.ok) {
    return {
      error:
        scheduled.reason === "ambiguous"
          ? "That time occurs twice when daylight saving time ends. Choose another time."
          : scheduled.reason === "nonexistent"
            ? "That time does not exist when daylight saving time begins. Choose another time."
            : "Pick a valid date and time.",
    };
  }

  const supabase = await createClient();
  const { data: bookingId, error } = await createHourlyRequest(supabase, {
    providerServiceId: parsed.data.providerServiceId,
    scheduledAt: scheduled.date.toISOString(),
    estimatedMinutes: parsed.data.estimatedMinutes,
    responseWindowHours: parsed.data.responseWindowHours,
    address: parsed.data.address,
    jobZip: parsed.data.jobZip,
    details: parsed.data.details,
  });
  if (error || !bookingId) {
    return { error: requestOperationMessage(error, "Could not send the request — try again.") };
  }

  const { data: booking } = await supabase
    .from("bookings")
    .select("id, customer_id, provider_id")
    .eq("id", bookingId)
    .maybeSingle();

  // Conversation setup is best-effort after the transaction commits. The new
  // booking remains the source of truth even if moderation is unavailable.
  if (booking) {
    try {
      const conversationId = await getConversationIdForBooking(supabase, {
        bookingId: booking.id,
        customerId: booking.customer_id,
        providerId: booking.provider_id,
      });
      if (parsed.data.details) {
        await sendModeratedMessage(supabase, conversationId, parsed.data.details);
      }
    } catch {
      // The dashboard can retry opening this booking's thread later.
    }
  }

  redirect("/dashboard?requested=1");
}
