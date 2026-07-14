"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireRole, requireUser } from "@/lib/auth/session";
import { executePendingRefunds } from "@/lib/booking/refunds";
import { requestOperationMessage } from "@/lib/booking/requests";
import { createClient } from "@/lib/supabase/server";

/**
 * Customer booking actions. All run as the signed-in user, so RLS and the
 * state-machine trigger are the real enforcement — these are thin wrappers.
 */

export type BookingMutationState = {
  error?: string;
  /** The locked cancellation outcome: full_refund | no_refund | no_payment. */
  policyResult?: string;
};

export async function cancelBooking(
  _previous: BookingMutationState,
  formData: FormData,
): Promise<BookingMutationState> {
  await requireUser();
  const bookingId = z.string().uuid().parse(formData.get("bookingId"));

  const supabase = await createClient();

  // Route hourly bookings through the actor-specific matrix RPC (which records
  // any owed refund); legacy bookings keep the original pre-payment cancel.
  const { data: booking } = await supabase
    .from("bookings")
    .select("booking_flow")
    .eq("id", bookingId)
    .maybeSingle();

  if (booking?.booking_flow === "hourly_v1") {
    const { data: result, error } = await supabase.rpc(
      "cancel_booking_as_customer",
      { p_booking_id: bookingId },
    );
    if (error) {
      return {
        error: requestOperationMessage(error, "Could not cancel the booking."),
      };
    }
    // A full-refund outcome recorded a refund request; execute it now. Any
    // Stripe/settle failure is reconciled by the webhook — never block the UI.
    if (result === "full_refund") {
      await executePendingRefunds(bookingId);
    }
    revalidatePath("/dashboard");
    return { policyResult: result ?? undefined };
  }

  const { error } = await supabase.rpc("cancel_booking_request", {
    p_booking_id: bookingId,
  });
  if (error) {
    return {
      error: requestOperationMessage(error, "Could not cancel the request."),
    };
  }

  revalidatePath("/dashboard");
  return {};
}

/** Hide a declined request from this customer's dashboard without deleting it. */
export async function dismissDeclinedBooking(formData: FormData) {
  await requireRole("customer", "/dashboard");
  const bookingId = z.string().uuid().parse(formData.get("bookingId"));
  const supabase = await createClient();

  const { error } = await supabase.rpc("dismiss_booking", {
    p_booking_id: bookingId,
  });
  if (error) {
    throw new Error(requestOperationMessage(error));
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
