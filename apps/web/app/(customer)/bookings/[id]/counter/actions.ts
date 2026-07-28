"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { requireRole } from "@/lib/auth/session";
import { captureFirstHourHold } from "@/lib/booking/first-hour-hold";
import { QUOTE_DAYPARTS } from "@/lib/booking/quote-dayparts";
import { requestOperationMessage } from "@/lib/booking/requests";
import { createClient } from "@/lib/supabase/server";

export type CounterOfferState = { error?: string };

const idSchema = z.string().uuid();
const quoteDaypartSchema = z.enum(QUOTE_DAYPARTS);

/**
 * Take the student's proposed time. The RPC moves the job to that time and flips
 * the request to `accepted`; we then capture the EXISTING first-hour hold. The
 * provider never changed, so the hold is still valid — there is no
 * re-authorization here (unlike quick-booking a different provider). The
 * `payment_intent.succeeded` webhook advances accepted → booked.
 */
export async function acceptCounterOffer(
  _previous: CounterOfferState,
  formData: FormData,
): Promise<CounterOfferState> {
  await requireRole("customer", "/dashboard");
  const bookingId = idSchema.parse(formData.get("bookingId"));
  const supabase = await createClient();

  const { error } = await supabase.rpc("accept_hourly_counter_offer", {
    p_booking_id: bookingId,
  });
  if (error) {
    return {
      error: requestOperationMessage(error, "Could not accept the new time."),
    };
  }

  // A capture hiccup is reconciled by the webhook; never block acceptance on it.
  try {
    await captureFirstHourHold(bookingId);
  } catch (captureError) {
    console.error("[counter] first-hour capture failed", captureError);
  }

  redirect("/dashboard?countered=accepted");
}

/**
 * Turn the proposed time down. The request becomes `declined`, which is what
 * surfaces the ranked alternatives + one-tap quick-book, so send the customer
 * straight there rather than back to an empty dashboard.
 */
export async function rejectCounterOffer(
  _previous: CounterOfferState,
  formData: FormData,
): Promise<CounterOfferState> {
  await requireRole("customer", "/dashboard");
  const bookingId = idSchema.parse(formData.get("bookingId"));
  const supabase = await createClient();

  const { error } = await supabase.rpc("reject_hourly_counter_offer", {
    p_booking_id: bookingId,
  });
  if (error) {
    return {
      error: requestOperationMessage(error, "Could not turn down the new time."),
    };
  }

  redirect(`/bookings/${bookingId}/replace`);
}

export async function selectQuoteCounterOption(
  _previous: CounterOfferState,
  formData: FormData,
): Promise<CounterOfferState> {
  await requireRole("customer", "/dashboard");
  const bookingId = idSchema.parse(formData.get("bookingId"));
  const optionId = idSchema.parse(formData.get("optionId"));
  const requestedDaypart = quoteDaypartSchema.parse(
    formData.get("requestedDaypart"),
  );
  const supabase = await createClient();
  const { error } = await supabase.rpc("select_quote_counter_option", {
    p_booking_id: bookingId,
    p_option_id: optionId,
    p_requested_daypart: requestedDaypart,
  });
  if (error) {
    return {
      error: requestOperationMessage(error, "Could not select that option."),
    };
  }
  redirect("/dashboard?countered=selected");
}

export async function rejectQuoteCounter(
  _previous: CounterOfferState,
  formData: FormData,
): Promise<CounterOfferState> {
  await requireRole("customer", "/dashboard");
  const bookingId = idSchema.parse(formData.get("bookingId"));
  const supabase = await createClient();
  const { error } = await supabase.rpc("withdraw_quote_negotiation", {
    p_booking_id: bookingId,
  });
  if (error) {
    return {
      error: requestOperationMessage(error, "Could not decline those options."),
    };
  }
  redirect(`/bookings/${bookingId}/replace`);
}
