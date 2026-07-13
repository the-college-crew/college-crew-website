"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireUser } from "@/lib/auth/session";
import type { Json } from "@/lib/db/types";
import {
  requestAuditFields,
  stableContentHash,
} from "@/lib/legal/acceptance";
import {
  getBookingAddendumSnapshot,
  LEGAL_CONTENT_VERSION,
} from "@/lib/legal/waivers";
import { createBookingPaymentIntent } from "@/lib/stripe/connect";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/utils";

export type ConfirmPayState = {
  error?: string;
  /** Stripe isn't configured in this environment — show the pending notice. */
  unconfigured?: boolean;
  /** Set on success: mounts the Payment Element for this intent. */
  clientSecret?: string;
};

/**
 * Confirm & pay (SPEC §3/§6): runs when the customer confirms an accepted
 * booking. Creates the destination-charge PaymentIntent (platform fee comes
 * out of the provider's payout) and returns its client secret; the panel
 * mounts Stripe Elements with it. The booking flips to `paid` from the
 * webhook (app/api/webhooks/stripe/route.ts), never from the client.
 */
export async function confirmAndPay(
  _prev: ConfirmPayState,
  formData: FormData,
): Promise<ConfirmPayState> {
  const user = await requireUser();
  const bookingId = z.string().uuid().parse(formData.get("bookingId"));
  if (formData.get("acceptAddendum") !== "on") {
    return { error: "Review and accept the booking risk addendum first." };
  }

  const supabase = await createClient();
  const { data: booking } = await supabase
    .from("bookings")
    .select(
      `id, customer_id, provider_id, status, scheduled_at, address, price_cents,
       platform_fee_cents,
       service:services(name, slug),
       provider:provider_profiles(display_name),
       customer:profiles!bookings_customer_id_fkey(full_name)`,
    )
    .eq("id", bookingId)
    .maybeSingle();

  if (!booking || booking.customer_id !== user.id) {
    return { error: "Booking not found." };
  }
  if (booking.status !== "accepted") {
    return { error: "This booking isn't awaiting payment." };
  }

  const service = Array.isArray(booking.service)
    ? booking.service[0]
    : booking.service;
  const provider = Array.isArray(booking.provider)
    ? booking.provider[0]
    : booking.provider;
  const customer = Array.isArray(booking.customer)
    ? booking.customer[0]
    : booking.customer;

  const snapshot = service
    ? getBookingAddendumSnapshot({
        serviceSlug: service.slug,
        serviceName: service.name,
        scheduledAt: formatDateTime(booking.scheduled_at),
        address: booking.address,
        providerName: provider?.display_name ?? "Provider",
        customerName: customer?.full_name ?? "Customer",
      })
    : null;
  if (!service || !snapshot) {
    return {
      error:
        "This service does not have a booking risk addendum yet. Contact College Crew before confirming.",
    };
  }

  const audit = await requestAuditFields();
  const { error: acceptanceError } = await supabase
    .from("legal_acceptances")
    .insert({
      user_id: user.id,
      booking_id: booking.id,
      kind: "booking_addendum",
      role: "customer",
      version: LEGAL_CONTENT_VERSION,
      content_hash: stableContentHash(snapshot),
      signer_name: customer?.full_name ?? "Customer",
      service_slug: service.slug,
      service_name: service.name,
      snapshot: snapshot as Json,
      ...audit,
    });
  if (acceptanceError && acceptanceError.code !== "23505") {
    return { error: "Could not save the booking risk acceptance. Try again." };
  }

  // Connected-account identifiers are private provider data. Read one only
  // after the customer-owned booking above has authorized this operation.
  const admin = createAdminClient();
  const { data: providerPayout } = await admin
    .from("provider_profiles")
    .select("stripe_account_id")
    .eq("id", booking.provider_id)
    .maybeSingle();

  if (!providerPayout?.stripe_account_id) {
    return { unconfigured: true };
  }

  const result = await createBookingPaymentIntent({
    booking,
    providerStripeAccountId: providerPayout.stripe_account_id,
  });
  if (!result.configured) {
    return { unconfigured: true };
  }

  return { clientSecret: result.clientSecret };
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
  const user = await requireUser();

  const bookingId = z.string().uuid().parse(formData.get("bookingId"));
  const supabase = await createClient();
  const { data: acceptance } = await supabase
    .from("legal_acceptances")
    .select("id")
    .eq("booking_id", bookingId)
    .eq("user_id", user.id)
    .eq("kind", "booking_addendum")
    .maybeSingle();
  if (!acceptance) {
    throw new Error(
      "Accept the booking risk addendum before simulating payment.",
    );
  }

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
