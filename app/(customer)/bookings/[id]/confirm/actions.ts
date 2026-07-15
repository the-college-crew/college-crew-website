"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireUser } from "@/lib/auth/session";
import { HOURLY_AUTHORIZATION_VERSION } from "@/lib/booking/policy";
import { requestOperationMessage } from "@/lib/booking/requests";
import type { Json } from "@/lib/db/types";
import {
  requestAuditFields,
  stableContentHash,
} from "@/lib/legal/acceptance";
import {
  getBookingAddendumSnapshot,
  LEGAL_CONTENT_VERSION,
} from "@/lib/legal/waivers";
import {
  createBookingPaymentIntent,
  createFirstHourPaymentIntent,
} from "@/lib/stripe/connect";
import { ensureStripeCustomerForUser } from "@/lib/stripe/customers";
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
      `id, customer_id, provider_id, booking_flow, status, scheduled_at, address, price_cents,
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
  if (booking.booking_flow !== "legacy") {
    return { error: "Hourly first-hour payment is not available yet." };
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
 * Hourly first-hour payment (Hourly Booking v1, Phase 4). Runs when the
 * customer confirms an accepted hourly booking: records the risk-addendum and
 * saved-method authorization, persists the single first-hour payment attempt
 * (idempotent), then creates the destination-charge PaymentIntent. The booking
 * flips accepted → booked ONLY from the webhook, never from the client.
 */
export async function confirmFirstHourPayment(
  _prev: ConfirmPayState,
  formData: FormData,
): Promise<ConfirmPayState> {
  // Rollback disables only NEW request creation. An already-accepted booking
  // must remain payable so turning off the request flag never strands it.
  const user = await requireUser();
  const bookingId = z.string().uuid().parse(formData.get("bookingId"));
  if (formData.get("acceptAddendum") !== "on") {
    return { error: "Review and accept the booking risk addendum first." };
  }
  if (formData.get("authorizePayment") !== "on") {
    return { error: "Authorize the first-hour charge and saved method to continue." };
  }

  const supabase = await createClient();
  const { data: booking } = await supabase
    .from("bookings")
    .select(
      `id, customer_id, provider_id, booking_flow, status, scheduled_at, address,
       hourly_rate_cents_snapshot, estimated_minutes, initial_payment_due_at,
       service:services(name, slug),
       provider:provider_profiles(display_name),
       customer:profiles!bookings_customer_id_fkey(full_name)`,
    )
    .eq("id", bookingId)
    .maybeSingle();

  if (!booking || booking.customer_id !== user.id) {
    return { error: "Booking not found." };
  }
  if (booking.booking_flow !== "hourly_v1") {
    return { error: "This booking doesn’t use hourly payment." };
  }
  if (booking.status !== "accepted") {
    return { error: "This booking isn’t awaiting the first-hour payment." };
  }
  if (
    booking.initial_payment_due_at &&
    new Date(booking.initial_payment_due_at) <= new Date()
  ) {
    return { error: "The first-hour payment window has closed for this booking." };
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

  // Persist exactly one first-hour attempt (with the saved-method authorization)
  // BEFORE any Stripe call, so a refresh can't spawn a second charge.
  const { data: begun, error: beginError } = await supabase
    .rpc("begin_first_hour_payment", {
      p_booking_id: booking.id,
      p_authorization_version: HOURLY_AUTHORIZATION_VERSION,
    })
    .maybeSingle();
  if (beginError || !begun) {
    return {
      error: requestOperationMessage(
        beginError,
        "Could not start the first-hour payment. Try again.",
      ),
    };
  }

  const stripeCustomer = await ensureStripeCustomerForUser({
    userId: user.id,
    email: user.email ?? "",
    name: customer?.full_name ?? null,
  });
  if (!stripeCustomer.configured) {
    return { unconfigured: true };
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

  const intent = await createFirstHourPaymentIntent({
    bookingId: booking.id,
    amountCents: begun.amount_cents,
    applicationFeeCents: begun.application_fee_cents,
    stripeCustomerId: stripeCustomer.stripeCustomerId,
    providerStripeAccountId: providerPayout.stripe_account_id,
    idempotencyKey: begun.idempotency_key,
  });
  if (!intent.configured) {
    return { unconfigured: true };
  }

  const { error: attachError } = await supabase.rpc(
    "attach_first_hour_payment_intent",
    {
      p_booking_id: booking.id,
      p_stripe_payment_intent_id: intent.paymentIntentId,
      p_stripe_customer_id: stripeCustomer.stripeCustomerId,
    },
  );
  if (attachError) {
    return {
      error: requestOperationMessage(
        attachError,
        "Could not record the payment. Try again.",
      ),
    };
  }

  return { clientSecret: intent.clientSecret };
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

  const { data: booking } = await supabase
    .from("bookings")
    .select("booking_flow")
    .eq("id", bookingId)
    .eq("customer_id", user.id)
    .maybeSingle();
  if (booking?.booking_flow !== "legacy") {
    throw new Error("Hourly payment simulation is not available.");
  }

  const { error } = await supabase.rpc("transition_legacy_booking", {
    p_booking_id: bookingId,
    p_target_status: "paid",
  });
  if (error) {
    throw new Error(requestOperationMessage(error, "Could not simulate payment."));
  }

  revalidatePath("/dashboard");
  redirect("/dashboard?paid=1");
}
