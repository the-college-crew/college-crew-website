"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireUser } from "@/lib/auth/session";
import { requestOperationMessage } from "@/lib/booking/requests";
import { createClient } from "@/lib/supabase/server";

const DISPUTE_CATEGORIES = [
  "provider_no_show",
  "hours",
  "service",
  "payment",
  "cancellation",
  "other",
] as const;

const disputeSchema = z.object({
  bookingId: z.string().uuid(),
  category: z.enum(DISPUTE_CATEGORIES),
  narrative: z
    .string()
    .trim()
    .min(10, "Describe the issue in at least 10 characters.")
    .max(5000, "Keep it under 5,000 characters."),
});

export type DisputeFormState = { error?: string };

/**
 * Open a booking dispute (Phase 6). The customer supplies only a category and a
 * narrative; account, booking, invoice, deadline, and the freeze are all
 * server-derived by open_booking_dispute. A precharge dispute freezes the
 * autocharge; a late one is recorded without touching the completed booking.
 */
export async function openDispute(
  _previous: DisputeFormState,
  formData: FormData,
): Promise<DisputeFormState> {
  await requireUser();

  const parsed = disputeSchema.safeParse({
    bookingId: formData.get("bookingId"),
    category: formData.get("category"),
    narrative: formData.get("narrative"),
  });
  if (!parsed.success) {
    return {
      error:
        parsed.error.issues[0]?.message ??
        "Check the form and try again.",
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("open_booking_dispute", {
    p_booking_id: parsed.data.bookingId,
    p_category: parsed.data.category,
    p_narrative: parsed.data.narrative,
  });
  if (error) {
    return {
      error: requestOperationMessage(error, "Could not open the dispute."),
    };
  }

  revalidatePath(`/bookings/${parsed.data.bookingId}/dispute`);
  revalidatePath("/dashboard");
  redirect(`/bookings/${parsed.data.bookingId}/dispute?opened=1`);
}
