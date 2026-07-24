"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { getSession, requireUser } from "@/lib/auth/session";
import { finalizeHeldBooking } from "@/lib/booking/finalize";
import { releaseFirstHourHold } from "@/lib/booking/first-hour-hold";
import { isOfferedStartTime } from "@/lib/booking/replacement-ranking";
import { getReplacementPool } from "@/lib/booking/replacement-suggestions";
import { requestOperationMessage } from "@/lib/booking/requests";
import {
  cancelFirstHourAuthorization,
  createFirstHourPaymentIntent,
} from "@/lib/stripe/connect";
import {
  createPaymentElementCustomerSession,
  ensureStripeCustomerForUser,
} from "@/lib/stripe/customers";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * Quick-book re-authorization. A first-hour hold is a Stripe destination charge
 * bound to one provider's connected account, so switching providers can't move
 * the old hold — it places a fresh one on the chosen provider (reusing the job's
 * saved details) and the finalize step withdraws the original + releases its
 * now-useless hold. Two steps mirror instant-book: authorize, then confirm.
 */
export type ReplacementAuthState = {
  error?: string;
  /** Stripe isn't configured in this environment. */
  unconfigured?: boolean;
  /** Set on success: mount the Payment Element to confirm the fresh hold. */
  clientSecret?: string;
  paymentIntentId?: string;
  /** Lets the Payment Element show the customer's saved card (one confirm). */
  customerSessionClientSecret?: string;
};

const startSchema = z.object({
  originalBookingId: z.string().uuid(),
  providerServiceId: z.string().uuid(),
  /**
   * Set only when the chosen student can't make the original slot. Never
   * trusted: it is re-derived from the suggestion RPC below, so editing it
   * cannot book past a provider's availability or notice window.
   */
  scheduledAt: z.string().datetime({ offset: true }).optional(),
});

export async function startReplacementAuthorization(
  _prev: ReplacementAuthState,
  formData: FormData,
): Promise<ReplacementAuthState> {
  const session = await getSession();
  if (!session) return { error: "Log in to continue." };
  if (session.profile.role === "admin") {
    return { error: "Founder accounts can't send booking requests." };
  }
  if (!session.user.email_confirmed_at) {
    return { error: "Confirm your email before requesting a booking." };
  }

  const parsed = startSchema.safeParse({
    originalBookingId: formData.get("originalBookingId"),
    providerServiceId: formData.get("providerServiceId"),
    scheduledAt: formData.get("scheduledAt") ?? undefined,
  });
  if (!parsed.success) return { error: "Choose a replacement provider." };

  const supabase = await createClient();
  // The original must be the customer's own hourly booking in a replaceable
  // state: a timed-out request (past its response window), a declined one, or
  // one the provider cancelled.
  const { data: original } = await supabase
    .from("bookings")
    .select(
      `id, provider_id, status, scheduled_at, response_alert_at, estimated_minutes,
       details, address, job_zip, address_kind, service_city, latitude, longitude,
       on_decline_preference, time_flexibility, cancelled_by_role,
       service:services(slug)`,
    )
    .eq("id", parsed.data.originalBookingId)
    .eq("customer_id", session.user.id)
    .eq("booking_flow", "hourly_v1")
    .maybeSingle();
  if (!original) return { error: "Booking not found." };

  const now = Date.now();
  const timedOut =
    original.status === "requested" &&
    original.response_alert_at != null &&
    new Date(original.response_alert_at).getTime() <= now;
  const declined = original.status === "declined";
  const providerCancelled =
    original.status === "cancelled" &&
    original.cancelled_by_role === "provider";
  if (!timedOut && !declined && !providerCancelled) {
    return {
      error: "Replacement suggestions appear after the response deadline.",
    };
  }
  if (new Date(original.scheduled_at).getTime() <= now) {
    return { error: "The scheduled start has passed, so this request expired." };
  }

  // A time-shifted pick reschedules the job, so the requested start must be one
  // the database itself offered for this exact provider service. Anything else
  // is rejected rather than quietly falling back to the original time.
  let scheduledAt = original.scheduled_at;
  if (parsed.data.scheduledAt) {
    const service = Array.isArray(original.service)
      ? original.service[0]
      : original.service;
    const pool = await getReplacementPool(supabase, {
      id: original.id,
      serviceSlug: service?.slug ?? "",
    });
    if (
      !isOfferedStartTime(
        pool,
        parsed.data.providerServiceId,
        parsed.data.scheduledAt,
      )
    ) {
      return {
        error:
          "That time isn’t available anymore. Pick another student or time.",
      };
    }
    scheduledAt = parsed.data.scheduledAt;
  }
  if (
    original.estimated_minutes == null ||
    original.address == null ||
    original.job_zip == null ||
    original.address_kind == null ||
    original.service_city == null
  ) {
    return { error: "This booking is missing details needed to rebook." };
  }

  // Price + validate the chosen provider for the slot we're actually booking
  // (the original time, or the offered alternative). Runs the
  // admin/self/legal/bookable + availability/notice/conflict guards. No write.
  const { data: quote, error: quoteError } = await supabase
    .rpc("quote_hourly_offering_slot", {
      p_provider_service_id: parsed.data.providerServiceId,
      p_scheduled_at: scheduledAt,
      p_estimated_minutes: original.estimated_minutes,
    })
    .maybeSingle();
  if (quoteError || !quote) {
    return {
      error: requestOperationMessage(
        quoteError,
        "That provider isn’t available for this job anymore. Pick another.",
      ),
    };
  }
  if (quote.provider_id === original.provider_id) {
    return { error: "Choose a different provider." };
  }

  const rate = quote.hourly_rate_cents;

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
    stripeCustomerId: stripeCustomer.stripeCustomerId,
    providerStripeAccountId: providerPayout.stripe_account_id,
    idempotencyKey: `fhauth_${bookingId}`,
  });
  if (!intent.configured) return { unconfigured: true };

  const { error: draftError } = await supabase.rpc("create_booking_draft", {
    p_booking_id: bookingId,
    p_provider_service_id: parsed.data.providerServiceId,
    p_scheduled_at: scheduledAt,
    p_estimated_minutes: original.estimated_minutes,
    p_details: original.details ?? "",
    p_address: original.address,
    p_job_zip: original.job_zip,
    p_address_kind: original.address_kind,
    p_service_city: original.service_city,
    p_latitude: original.latitude ?? undefined,
    p_longitude: original.longitude ?? undefined,
    p_on_decline_preference: original.on_decline_preference,
    // Carry the customer's original "may they suggest another time?" choice.
    p_time_flexibility: original.time_flexibility,
    p_hourly_rate_cents: rate,
    p_stripe_payment_intent_id: intent.paymentIntentId,
    p_stripe_customer_id: stripeCustomer.stripeCustomerId,
    p_original_booking_id: original.id,
  });
  if (draftError) {
    // Don't strand the fresh hold if the draft couldn't be persisted.
    await cancelFirstHourAuthorization({ paymentIntentId: intent.paymentIntentId });
    return {
      error: requestOperationMessage(draftError, "Could not start the replacement. Try again."),
    };
  }

  const customerSession = await createPaymentElementCustomerSession(
    stripeCustomer.stripeCustomerId,
  );

  return {
    clientSecret: intent.clientSecret,
    paymentIntentId: intent.paymentIntentId,
    customerSessionClientSecret: customerSession.configured
      ? customerSession.clientSecret
      : undefined,
  };
}

export type FinalizeReplacementState = { error?: string };

/**
 * Step B: the fresh hold is confirmed client-side. Create the replacement booking
 * (finalize atomically withdraws the still-open original), then release the old
 * provider's now-useless hold. The `withdrawn` sweep is the backstop if the
 * release call fails here.
 */
export async function finalizeReplacement(
  paymentIntentId: string,
  originalBookingId: string,
): Promise<FinalizeReplacementState> {
  const user = await requireUser();
  const supabase = await createClient();

  const result = await finalizeHeldBooking(supabase, user.id, paymentIntentId);
  if (result.error) return { error: result.error };

  await releaseFirstHourHold(originalBookingId).catch(() => {});

  redirect("/dashboard?replaced=1");
}
