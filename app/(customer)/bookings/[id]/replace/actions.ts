"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { requireRole } from "@/lib/auth/session";
import {
  replaceHourlyRequest,
  requestOperationMessage,
} from "@/lib/booking/requests";
import {
  getConversationIdForBooking,
  sendModeratedMessage,
} from "@/lib/messaging/conversation";
import { createClient } from "@/lib/supabase/server";

export type ReplacementFormState = { error?: string };

const replacementSchema = z.object({
  originalBookingId: z.string().uuid(),
  providerServiceId: z.string().uuid(),
  responseWindowHours: z.coerce.number().int(),
});

export async function createReplacementRequest(
  _previous: ReplacementFormState,
  formData: FormData,
): Promise<ReplacementFormState> {
  const session = await requireRole("customer", "/dashboard");
  const parsed = replacementSchema.safeParse({
    originalBookingId: formData.get("originalBookingId"),
    providerServiceId: formData.get("providerServiceId"),
    responseWindowHours: formData.get("responseWindowHours"),
  });
  if (!parsed.success) return { error: "Choose a replacement and response window." };

  const supabase = await createClient();
  const { data: bookingId, error } = await replaceHourlyRequest(supabase, {
    originalBookingId: parsed.data.originalBookingId,
    providerServiceId: parsed.data.providerServiceId,
    responseWindowHours: parsed.data.responseWindowHours,
  });
  if (error || !bookingId) {
    return {
      error: requestOperationMessage(error, "Could not send the replacement request."),
    };
  }

  const { data: booking } = await supabase
    .from("bookings")
    .select("id, customer_id, provider_id, details")
    .eq("id", bookingId)
    .eq("customer_id", session.user.id)
    .maybeSingle();
  if (booking) {
    try {
      const conversationId = await getConversationIdForBooking(supabase, {
        bookingId: booking.id,
        customerId: booking.customer_id,
        providerId: booking.provider_id,
      });
      if (booking.details) {
        await sendModeratedMessage(supabase, conversationId, booking.details);
      }
    } catch {
      // The replacement is committed; its dashboard thread can be opened later.
    }
  }

  redirect("/dashboard?replaced=1");
}
