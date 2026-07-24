import "server-only";

import { z } from "zod";

import {
  calculateInvoiceAllocation,
  HOURLY_AUTHORIZATION_VERSION,
} from "@/lib/booking/policy";
import { requestOperationMessage } from "@/lib/booking/requests";
import type { Json } from "@/lib/db/types";
import { requestAuditFields, stableContentHash } from "@/lib/legal/acceptance";
import {
  BOOKING_RISK_VERSION,
  getBookingRiskSnapshot,
  getPaymentAuthorizationSnapshot,
} from "@/lib/legal/waivers";
import {
  getConversationIdForBooking,
  sendModeratedMessage,
} from "@/lib/messaging/conversation";
import { getStripe } from "@/lib/stripe/server";
import type { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/utils";

type ServerClient = Awaited<ReturnType<typeof createClient>>;

/**
 * Shared finalize step for the authorize-first instant-book flow, used by both a
 * fresh booking and a quick-book replacement. The card hold is already confirmed
 * client-side, so: verify it's actually held, atomically create the booking + its
 * authorized payment row (which notifies the provider), record the customer's
 * legal consent, and post the job details to the booking chat. Returns the new
 * booking id; the caller owns any redirect and (for a replacement) releasing the
 * superseded hold.
 */
export async function finalizeHeldBooking(
  supabase: ServerClient,
  userId: string,
  paymentIntentId: string,
): Promise<{ bookingId?: string; error?: string }> {
  const pi = z.string().min(1).parse(paymentIntentId);

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

  await recordBookingLegal(supabase, userId, bookingId);
  const { data: booking } = await supabase
    .from("bookings")
    .select("details")
    .eq("id", bookingId)
    .maybeSingle();
  await postDetailsMessage(supabase, bookingId, booking?.details ?? "");

  return { bookingId };
}

/** Open (or find) the booking's chat and post the customer's job details. */
export async function postDetailsMessage(
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
