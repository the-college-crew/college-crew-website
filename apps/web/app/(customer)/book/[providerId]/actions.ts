"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { getSession, requireUser } from "@/lib/auth/session";
import {
  finalizeHeldBooking,
  postDetailsMessage,
} from "@/lib/booking/finalize";
import { pilotLocalDateTimeToUtc } from "@/lib/booking/policy";
import { createQuoteRequest, requestOperationMessage } from "@/lib/booking/requests";
import { areBookingRequestsEnabled, isHourlyBookingEnabled } from "@/lib/env";
import {
  getBookingFrom,
  resolveBookingOrigin,
} from "@/lib/location/booking-from";
import {
  cancelFirstHourAuthorization,
  createFirstHourPaymentIntent,
} from "@/lib/stripe/connect";
import { ensureStripeCustomerForUser } from "@/lib/stripe/customers";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type BookingFormState = { error?: string };

/**
 * Request a flat quote (quote-only services — hauling, pressure/window washing).
 * Hourly services now use the authorize-first instant-book flow below and never
 * reach this action.
 */
const quoteSchema = z.object({
  providerServiceId: z.string().uuid("Pick a service."),
  scheduledLocal: z.string().min(1, "Pick a date and time."),
  estimatedMinutes: z.coerce.number().int(),
  responseWindowHours: z.coerce.number().int(),
  details: z.string().trim().max(2000).optional().default(""),
});

export async function createBookingRequest(
  _prev: BookingFormState,
  formData: FormData,
): Promise<BookingFormState> {
  if (!areBookingRequestsEnabled()) {
    return {
      error:
        "New booking requests are temporarily paused while we update scheduling.",
    };
  }

  const session = await getSession();
  if (!session) return { error: "Log in to request a booking." };
  if (session.profile.role === "admin") {
    return { error: "Founder accounts can't send booking requests." };
  }
  if (!session.user.email_confirmed_at) {
    return { error: "Confirm your email before requesting a booking." };
  }

  const parsed = quoteSchema.safeParse({
    providerServiceId: formData.get("providerServiceId"),
    scheduledLocal: formData.get("scheduledLocal"),
    estimatedMinutes: formData.get("estimatedMinutes"),
    responseWindowHours: formData.get("responseWindowHours"),
    details: formData.get("details"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const bookingFrom = await getBookingFrom();
  const origin = resolveBookingOrigin(bookingFrom, session.profile);
  if (!origin.isSet || origin.addressLine.length < 5 || !/^\d{5}$/.test(origin.zip)) {
    return {
      error:
        "Choose where the job is with “Booking from” at the top of this page.",
    };
  }

  const scheduled = pilotLocalDateTimeToUtc(parsed.data.scheduledLocal);
  if (!scheduled.ok) {
    return { error: dstMessage(scheduled.reason) };
  }

  const supabase = await createClient();
  const { data: offering } = await supabase
    .from("public_provider_offerings")
    .select("pricing_mode, is_quote_bookable")
    .eq("provider_service_id", parsed.data.providerServiceId)
    .maybeSingle();
  if (!offering) {
    return { error: "That service is no longer available to book." };
  }
  if (offering.pricing_mode !== "quote" || offering.is_quote_bookable !== true) {
    // Hourly offerings go through the authorize-first instant-book flow.
    return { error: "That service is no longer available to book." };
  }

  const { data: bookingId, error } = await createQuoteRequest(supabase, {
    providerServiceId: parsed.data.providerServiceId,
    scheduledAt: scheduled.date.toISOString(),
    estimatedMinutes: parsed.data.estimatedMinutes,
    responseWindowHours: parsed.data.responseWindowHours,
    address: origin.addressLine,
    jobZip: origin.zip,
    addressKind: origin.kind,
    serviceCity: origin.town,
    latitude: origin.latitude,
    longitude: origin.longitude,
    details: parsed.data.details,
  });
  if (error || !bookingId) {
    return { error: requestOperationMessage(error, "Could not send the request. Try again.") };
  }

  await postDetailsMessage(supabase, bookingId, parsed.data.details);
  redirect(`/dashboard?requested=quote`);
}

/**
 * Step A of instant-book: validate + price the hourly slot, AUTHORIZE the first
 * hour (a manual-capture hold), and stash the validated params in a draft. No
 * booking exists yet — it (and the provider notification) is created only once
 * the card hold lands, in `finalizeBooking`.
 */
export type AuthorizeState = {
  error?: string;
  /** Stripe isn't configured in this environment. */
  unconfigured?: boolean;
  /** Set on success: mounts the Payment Element to confirm the hold. */
  clientSecret?: string;
  paymentIntentId?: string;
};

const TIME_FLEXIBILITY = ["flexible", "fixed"] as const;

const authorizeSchema = z.object({
  providerServiceId: z.string().uuid("Pick a service."),
  scheduledLocal: z.string().min(1, "Pick a date and time."),
  estimatedMinutes: z.coerce.number().int(),
  details: z.string().trim().max(2000).optional().default(""),
  /** Whether the student may counter with a different time. */
  timeFlexibility: z.enum(TIME_FLEXIBILITY).default("flexible"),
});

export async function startBookingAuthorization(
  _prev: AuthorizeState,
  formData: FormData,
): Promise<AuthorizeState> {
  if (!areBookingRequestsEnabled() || !isHourlyBookingEnabled()) {
    return { error: "New booking requests are temporarily paused." };
  }

  const session = await getSession();
  if (!session) return { error: "Log in to request a booking." };
  if (session.profile.role === "admin") {
    return { error: "Founder accounts can't send booking requests." };
  }
  if (!session.user.email_confirmed_at) {
    return { error: "Confirm your email before requesting a booking." };
  }

  const parsed = authorizeSchema.safeParse({
    providerServiceId: formData.get("providerServiceId"),
    scheduledLocal: formData.get("scheduledLocal"),
    estimatedMinutes: formData.get("estimatedMinutes"),
    details: formData.get("details"),
    timeFlexibility: formData.get("timeFlexibility"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const bookingFrom = await getBookingFrom();
  const origin = resolveBookingOrigin(bookingFrom, session.profile);
  if (!origin.isSet || origin.addressLine.length < 5 || !/^\d{5}$/.test(origin.zip)) {
    return {
      error:
        "Choose where the job is with “Booking from” at the top of this page.",
    };
  }

  const scheduled = pilotLocalDateTimeToUtc(parsed.data.scheduledLocal);
  if (!scheduled.ok) return { error: dstMessage(scheduled.reason) };

  const supabase = await createClient();
  const { data: offering } = await supabase
    .from("public_provider_offerings")
    .select("pricing_mode, is_hourly_bookable")
    .eq("provider_service_id", parsed.data.providerServiceId)
    .maybeSingle();
  if (
    !offering ||
    offering.pricing_mode === "quote" ||
    offering.is_hourly_bookable !== true
  ) {
    return { error: "That service is no longer available to book." };
  }

  // Price + validate the slot (this also runs the admin/self/legal/bookable
  // guards). No row is written.
  const { data: quote, error: quoteError } = await supabase
    .rpc("quote_hourly_offering_slot", {
      p_provider_service_id: parsed.data.providerServiceId,
      p_scheduled_at: scheduled.date.toISOString(),
      p_estimated_minutes: parsed.data.estimatedMinutes,
    })
    .maybeSingle();
  if (quoteError || !quote) {
    return {
      error: requestOperationMessage(
        quoteError,
        "That time isn’t available anymore. Pick another.",
      ),
    };
  }

  const rate = quote.hourly_rate_cents;
  const feeCents = Math.round((rate * 500) / 10000);

  const stripeCustomer = await ensureStripeCustomerForUser({
    userId: session.user.id,
    email: session.user.email ?? "",
    name: session.profile.full_name ?? null,
  });
  if (!stripeCustomer.configured) return { unconfigured: true };

  const admin = createAdminClient();
  const { data: providerPayout } = await admin
    .from("provider_profiles")
    .select("stripe_account_id")
    .eq("id", quote.provider_id)
    .maybeSingle();
  if (!providerPayout?.stripe_account_id) return { unconfigured: true };

  const bookingId = crypto.randomUUID();
  const intent = await createFirstHourPaymentIntent({
    bookingId,
    amountCents: rate,
    applicationFeeCents: feeCents,
    stripeCustomerId: stripeCustomer.stripeCustomerId,
    providerStripeAccountId: providerPayout.stripe_account_id,
    idempotencyKey: `fhauth_${bookingId}`,
  });
  if (!intent.configured) return { unconfigured: true };

  const { error: draftError } = await supabase.rpc("create_booking_draft", {
    p_booking_id: bookingId,
    p_provider_service_id: parsed.data.providerServiceId,
    p_scheduled_at: scheduled.date.toISOString(),
    p_estimated_minutes: parsed.data.estimatedMinutes,
    p_details: parsed.data.details,
    p_address: origin.addressLine,
    p_job_zip: origin.zip,
    p_address_kind: origin.kind,
    p_service_city: origin.town,
    p_latitude: origin.latitude ?? undefined,
    p_longitude: origin.longitude ?? undefined,
    // Retired as a customer-facing choice (no auto-matching); the column stays
    // for existing rows, so pass the neutral value.
    p_on_decline_preference: "keep_control",
    p_time_flexibility: parsed.data.timeFlexibility,
    p_hourly_rate_cents: rate,
    p_stripe_payment_intent_id: intent.paymentIntentId,
    p_stripe_customer_id: stripeCustomer.stripeCustomerId,
  });
  if (draftError) {
    // Don't strand the hold if we couldn't persist the draft.
    await cancelFirstHourAuthorization({ paymentIntentId: intent.paymentIntentId });
    return {
      error: requestOperationMessage(draftError, "Could not start the booking. Try again."),
    };
  }

  return { clientSecret: intent.clientSecret, paymentIntentId: intent.paymentIntentId };
}

/**
 * Step B of instant-book: the card hold is confirmed client-side, so create the
 * booking + its authorized payment row atomically (which notifies the provider),
 * record the customer's consent, and post the job details to the booking chat.
 */
export type FinalizeState = { error?: string };

export async function finalizeBooking(
  paymentIntentId: string,
): Promise<FinalizeState> {
  const user = await requireUser();
  const supabase = await createClient();

  const result = await finalizeHeldBooking(supabase, user.id, paymentIntentId);
  if (result.error) return { error: result.error };

  redirect(`/dashboard?requested=1`);
}

function dstMessage(reason: string) {
  return reason === "ambiguous"
    ? "That time occurs twice when daylight saving time ends. Choose another time."
    : reason === "nonexistent"
      ? "That time does not exist when daylight saving time begins. Choose another time."
      : "Pick a valid date and time.";
}
