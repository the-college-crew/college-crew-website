"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireUser } from "@/lib/auth/session";
import { createBookingPaymentIntent } from "@/lib/stripe/connect";
import { createClient } from "@/lib/supabase/server";

export type ConfirmPayState = {
  error?: string;
  /** Stripe isn't provisioned yet — show the pending-payments notice. */
  unconfigured?: boolean;
};

/**
 * Confirm & pay (SPEC §3/§6): runs when the customer confirms an accepted
 * booking. With Stripe unprovisioned this surfaces the stub notice; once
 * keys exist it creates the destination-charge PaymentIntent.
 *
 * TODO(stripe): render Stripe Elements with the returned client secret and
 * flip the booking to `paid` from the webhook, not from the client.
 */
export async function confirmAndPay(
  _prev: ConfirmPayState,
  formData: FormData,
): Promise<ConfirmPayState> {
  const user = await requireUser();
  const bookingId = z.string().uuid().parse(formData.get("bookingId"));

  const supabase = await createClient();
  const { data: booking } = await supabase
    .from("bookings")
    .select(
      "id, customer_id, status, price_cents, platform_fee_cents, provider:provider_profiles(stripe_account_id)",
    )
    .eq("id", bookingId)
    .maybeSingle();

  if (!booking || booking.customer_id !== user.id) {
    return { error: "Booking not found." };
  }
  if (booking.status !== "accepted") {
    return { error: "This booking isn't awaiting payment." };
  }
  if (!booking.provider.stripe_account_id) {
    return { unconfigured: true };
  }

  const result = await createBookingPaymentIntent({
    booking,
    providerStripeAccountId: booking.provider.stripe_account_id,
  });
  if (!result.configured) {
    return { unconfigured: true };
  }

  return {
    error:
      "Stripe is configured, but the payment form isn't wired yet — finish the Elements integration in this route before demoing payments.",
  };
}

/**
 * Development-only stand-in so the full booking state machine can be
 * demonstrated before the Stripe test account exists. Runs as the signed-in
 * customer — the database trigger still enforces accepted → paid.
 */
export async function simulatePayment(formData: FormData) {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Payment simulation is disabled in production.");
  }
  await requireUser();

  const bookingId = z.string().uuid().parse(formData.get("bookingId"));
  const supabase = await createClient();
  const { error } = await supabase
    .from("bookings")
    .update({ status: "paid" })
    .eq("id", bookingId);
  if (error) {
    throw new Error(`Could not simulate payment: ${error.message}`);
  }

  revalidatePath("/dashboard");
  redirect("/dashboard?paid=1");
}
