"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireRole, requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

/**
 * Customer booking actions. All run as the signed-in user, so RLS and the
 * state-machine trigger are the real enforcement — these are thin wrappers.
 */

export async function cancelBooking(formData: FormData) {
  await requireUser();
  const bookingId = z.string().uuid().parse(formData.get("bookingId"));

  const supabase = await createClient();
  // Only 'requested' and 'accepted' can be cancelled. Scoping the update to
  // those states means a stale click after the provider already declined (or
  // the booking otherwise moved on) updates zero rows instead of tripping the
  // state-machine trigger with an illegal transition. revalidate then refreshes
  // the page to the real status.
  const { error } = await supabase
    .from("bookings")
    .update({ status: "cancelled" })
    .eq("id", bookingId)
    .in("status", ["requested", "accepted"]);
  if (error) {
    throw new Error(`Could not cancel: ${error.message}`);
  }

  revalidatePath("/dashboard");
}

/** Hide a declined request from this customer's dashboard without deleting it. */
export async function dismissDeclinedBooking(formData: FormData) {
  const session = await requireRole("customer", "/dashboard");
  const bookingId = z.string().uuid().parse(formData.get("bookingId"));
  const supabase = await createClient();

  const { error } = await supabase
    .from("bookings")
    .update({ dismissed_at: new Date().toISOString() })
    .eq("id", bookingId)
    .eq("customer_id", session.user.id)
    .eq("status", "declined")
    .is("dismissed_at", null);
  if (error) {
    throw new Error(`Could not dismiss booking: ${error.message}`);
  }

  revalidatePath("/dashboard");
}

export type ReviewFormState = { error?: string; success?: boolean };

const reviewSchema = z.object({
  bookingId: z.string().uuid(),
  rating: z.coerce.number().int().min(1).max(5),
  text: z.string().trim().max(2000).optional().default(""),
});

export async function submitReview(
  _prev: ReviewFormState,
  formData: FormData,
): Promise<ReviewFormState> {
  await requireUser();

  const parsed = reviewSchema.safeParse({
    bookingId: formData.get("bookingId"),
    rating: formData.get("rating"),
    text: formData.get("text"),
  });
  if (!parsed.success) {
    return { error: "Pick a rating from 1 to 5." };
  }

  const supabase = await createClient();
  // RLS: insert allowed only for the customer's own completed booking.
  const { error } = await supabase.from("reviews").insert({
    booking_id: parsed.data.bookingId,
    rating: parsed.data.rating,
    text: parsed.data.text,
  });
  if (error) {
    return {
      error:
        error.code === "23505"
          ? "You already reviewed this booking."
          : "Could not save the review — try again.",
    };
  }

  revalidatePath("/dashboard");
  return { success: true };
}
