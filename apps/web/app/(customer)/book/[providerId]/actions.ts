"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { getSession, requireUser } from "@/lib/auth/session";
import {
  calculateInvoiceAllocation,
  HOURLY_AUTHORIZATION_VERSION,
  pilotLocalDateTimeToUtc,
} from "@/lib/booking/policy";
import { createQuoteRequest, requestOperationMessage } from "@/lib/booking/requests";
import type { Json } from "@/lib/db/types";
import { areBookingRequestsEnabled, isHourlyBookingEnabled } from "@/lib/env";
import { requestAuditFields, stableContentHash } from "@/lib/legal/acceptance";
import {
  BOOKING_RISK_VERSION,
  getBookingRiskSnapshot,
  getPaymentAuthorizationSnapshot,
} from "@/lib/legal/waivers";
import {
  getBookingFrom,
  resolveBookingOrigin,
} from "@/lib/location/booking-from";
import {
  getConversationIdForBooking,
  sendModeratedMessage,
} from "@/lib/messaging/conversation";
import {
  cancelFirstHourAuthorization,
  createFirstHourPaymentIntent,
} from "@/lib/stripe/connect";
import { ensureStripeCustomerForUser } from "@/lib/stripe/customers";
import { getStripe } from "@/lib/stripe/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/utils";

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

const DECLINE_PREFERENCES = ["auto_rematch", "keep_control"] as const;

const authorizeSchema = z.object({
  providerServiceId: z.string().uuid("Pick a service."),
  scheduledLocal: z.string().min(1, "Pick a date and time."),
  estimatedMinutes: z.coerce.number().int(),
  details: z.string().trim().max(2000).optional().default(""),
  onDeclinePreference: z.enum(DECLINE_PREFERENCES).default("keep_control"),
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
    onDeclinePreference: formData.get("onDeclinePreference"),
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
    p_on_decline_preference: parsed.data.onDeclinePreference,
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
  const pi = z.string().min(1).parse(paymentIntentId);
  const supabase = await createClient();

  // The hold must actually be in place before we create the booking.
  const stripe = getStripe();
  if (stripe) {
    try {
      const intent = await stripe.paymentIntents.retrieve(pi);
      if (intent.status !== "requires_capture") {
        return { error: "Your card hold didn’t complete. Please try again." };
      }
    } catch {
      return { error: "Could not verify the payment hold. Try again." };
    }
  }

  const { data: bookingId, error } = await supabase.rpc("finalize_hourly_booking", {
    p_stripe_payment_intent_id: pi,
  });
  if (error || !bookingId) {
    return {
      error: requestOperationMessage(error, "Could not confirm the booking. Try again."),
    };
  }

  await recordBookingLegal(supabase, user.id, bookingId);
  const { data: booking } = await supabase
    .from("bookings")
    .select("details")
    .eq("id", bookingId)
    .maybeSingle();
  await postDetailsMessage(supabase, bookingId, booking?.details ?? "");

  redirect(`/dashboard?requested=1`);
}

type ServerClient = Awaited<ReturnType<typeof createClient>>;

function dstMessage(reason: string) {
  return reason === "ambiguous"
    ? "That time occurs twice when daylight saving time ends. Choose another time."
    : reason === "nonexistent"
      ? "That time does not exist when daylight saving time begins. Choose another time."
      : "Pick a valid date and time.";
}

/** Open (or find) the booking's chat and post the customer's job details. */
async function postDetailsMessage(
  supabase: ServerClient,
  bookingId: string,
  details: string,
) {
  const { data: booking } = await supabase
    .from("bookings")
    .select("id, customer_id, provider_id")
    .eq("id", bookingId)
    .maybeSingle();
  if (!booking) return;
  try {
    const conversationId = await getConversationIdForBooking(supabase, {
      bookingId: booking.id,
      customerId: booking.customer_id,
      providerId: booking.provider_id,
    });
    if (details) await sendModeratedMessage(supabase, conversationId, details);
  } catch {
    // The dashboard can retry opening this booking's thread later.
  }
}

/** Record the risk addendum + payment authorization for an instant-booked job. */
async function recordBookingLegal(
  supabase: ServerClient,
  userId: string,
  bookingId: string,
) {
  const { data: booking } = await supabase
    .from("bookings")
    .select(
      `id, scheduled_at, address, hourly_rate_cents_snapshot, estimated_minutes,
       service:services(name, slug),
       provider:provider_profiles(display_name),
       customer:profiles!bookings_customer_id_fkey(full_name)`,
    )
    .eq("id", bookingId)
    .maybeSingle();
  if (!booking) return;

  const service = Array.isArray(booking.service) ? booking.service[0] : booking.service;
  const provider = Array.isArray(booking.provider) ? booking.provider[0] : booking.provider;
  const customer = Array.isArray(booking.customer) ? booking.customer[0] : booking.customer;
  if (
    !service ||
    booking.hourly_rate_cents_snapshot == null ||
    booking.estimated_minutes == null
  ) {
    return;
  }

  const audit = await requestAuditFields();
  const signerName = customer?.full_name ?? "Customer";

  const riskSnapshot = getBookingRiskSnapshot({
    serviceSlug: service.slug,
    serviceName: service.name,
    scheduledAt: formatDateTime(booking.scheduled_at),
    address: booking.address,
    providerName: provider?.display_name ?? "Provider",
    customerName: signerName,
  });
  await supabase.from("legal_acceptances").insert({
    user_id: userId,
    booking_id: booking.id,
    kind: "booking_addendum",
    role: "customer",
    version: BOOKING_RISK_VERSION,
    content_hash: stableContentHash(riskSnapshot),
    signer_name: signerName,
    service_slug: service.slug,
    service_name: service.name,
    snapshot: riskSnapshot as Json,
    ...audit,
  });

  const allocation = calculateInvoiceAllocation(
    booking.hourly_rate_cents_snapshot,
    booking.estimated_minutes,
  );
  const paymentAuthorization = getPaymentAuthorizationSnapshot({
    version: HOURLY_AUTHORIZATION_VERSION,
    bookingId: booking.id,
    firstHourCents: allocation.firstHourCents,
    estimatedTotalCents: allocation.subtotalCents,
    estimatedBalanceCents: allocation.remainingBalanceCents,
    dueAt: new Date().toISOString(),
  });
  await supabase.from("legal_acceptances").insert({
    user_id: userId,
    booking_id: booking.id,
    kind: "payment_authorization",
    role: "customer",
    version: HOURLY_AUTHORIZATION_VERSION,
    content_hash: stableContentHash(paymentAuthorization),
    signer_name: signerName,
    snapshot: paymentAuthorization as Json,
    ...audit,
  });
}
