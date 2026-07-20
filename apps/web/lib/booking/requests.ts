import "server-only";

import type { PostgrestError } from "@supabase/supabase-js";

import { createAdminClient } from "@/lib/supabase/admin";
import type { createClient } from "@/lib/supabase/server";

type ServerClient = Awaited<ReturnType<typeof createClient>>;

const REQUEST_ERROR_MESSAGES: Array<[string, string]> = [
  ["AUTHENTICATION_REQUIRED", "Log in to continue."],
  ["ADMIN_BOOKING_NOT_ALLOWED", "Founder accounts can't send booking requests."],
  ["SELF_BOOKING_NOT_ALLOWED", "You can't book your own listing."],
  ["EMAIL_CONFIRMATION_REQUIRED", "Confirm your email before requesting a booking."],
  ["CUSTOMER_NAME_REQUIRED", "Add your name in account settings before booking."],
  ["LEGAL_ACCEPTANCE_REQUIRED", "Review and accept the required current terms first."],
  ["PAYMENT_AUTHORIZATION_REQUIRED", "Review and authorize this booking payment first."],
  ["OFFERING_NOT_BOOKABLE", "That service is no longer available to book."],
  ["INVALID_DURATION", "Choose an estimate from 1 to 12 hours in 15-minute steps."],
  ["INVALID_RESPONSE_WINDOW", "Choose a response window that ends before the job."],
  ["RESPONSE_WINDOW_REACHES_START", "Choose a shorter response window."],
  ["INVALID_JOB_ZIP", "Enter a five-digit job ZIP."],
  ["INVALID_JOB_ADDRESS", "Enter the complete service address."],
  ["INVALID_ADDRESS_KIND", "Choose the job location with “Booking from”."],
  ["INVALID_SERVICE_CITY", "Choose the job location with “Booking from”."],
  ["INVALID_COORDINATES", "Choose the job location with “Booking from”."],
  ["DETAILS_TOO_LONG", "Keep job details to 2,000 characters or fewer."],
  ["MINIMUM_NOTICE_NOT_MET", "This job no longer meets the provider’s scheduling notice."],
  ["OUTSIDE_PROVIDER_AVAILABILITY", "The full job estimate must fit the provider’s availability."],
  ["PROVIDER_SLOT_ALREADY_RESERVED", "That provider just reserved another job during this time."],
  ["PROVIDER_NO_LONGER_READY", "This provider cannot accept new hourly work right now."],
  ["INVALID_FINAL_QUOTE", "Enter a final quote between $20 and $10,000."],
  ["FINAL_QUOTE_REQUIRED", "Send a final quote before accepting this request."],
  ["REPLACEMENT_NOT_AVAILABLE_YET", "Replacement suggestions appear after the response deadline."],
  ["REPLACEMENT_SERVICE_MISMATCH", "Choose a replacement offering for the same service."],
  ["REPLACEMENT_PROVIDER_REQUIRED", "Choose a different provider."],
  ["REQUEST_EXPIRED", "The scheduled start has passed, so this request expired."],
  ["BOOKING_NOT_AWAITING_PAYMENT", "This booking isn’t awaiting the first-hour payment."],
  ["PAYMENT_WINDOW_CLOSED", "The first-hour payment window has closed for this booking."],
  ["PROVIDER_NOT_PAYOUT_READY", "This provider can’t receive payments right now."],
  ["NOT_HOURLY_BOOKING", "This booking doesn’t use hourly payment."],
  ["AUTHORIZATION_VERSION_REQUIRED", "Accept the payment authorization to continue."],
  ["REQUEST_NO_LONGER_OPEN", "This request changed before your action completed. Refresh to see its current status."],
  ["BOOKING_NO_LONGER_CANCELLABLE", "This booking changed before cancellation completed."],
  ["BOOKING_NOT_FOUND", "Booking not found."],
  ["BOOKING_NOT_DISMISSIBLE", "This booking is no longer dismissible."],
  ["LEGACY_TRANSITION_NOT_ALLOWED", "This legacy booking changed before the action completed."],
  ["NOT_AUTHORIZED", "You’re not assigned to this job."],
  ["ARRIVAL_TOO_EARLY", "You can mark yourself arrived up to 30 minutes before the start."],
  ["BOOKING_NOT_BOOKED", "This job isn’t ready to start yet."],
  ["BOOKING_NOT_IN_PROGRESS", "Mark yourself arrived before submitting the invoice."],
  ["INVALID_MINUTES", "Enter billable time from 1 to 24 hours in 15-minute steps."],
  ["OVERAGE_EXPLANATION_REQUIRED", "Add a note explaining the time beyond the estimate."],
  ["INVOICE_NOT_FOUND", "That invoice no longer exists."],
  ["BOOKING_NOT_IN_REVIEW", "This booking isn’t awaiting payment review."],
  ["INVOICE_NOT_PAYABLE", "This invoice can’t be paid right now."],
  ["NO_BALANCE_DUE", "There’s no remaining balance to pay."],
  ["BALANCE_DUE", "This invoice still has a balance due."],
  ["DISPUTE_OPEN", "This booking is under review; payment is paused."],
  ["FIRST_HOUR_PAYMENT_MISSING", "The first-hour payment for this booking is missing."],
  ["PAYMENT_NOT_ATTACHABLE", "This payment changed before it could be recorded. Refresh and try again."],
  ["PAYMENT_NOT_FOUND", "That payment could not be found."],
  ["ALREADY_PAID", "This balance is already paid."],
  ["PAYMENT_PROCESSING", "This payment is still processing. Give it a moment."],
  ["BOOKING_ALREADY_ARRIVED", "This job already started. Open a dispute instead of cancelling."],
  ["USE_NO_SHOW_DISPUTE", "The start time has passed. Report a no-show instead of cancelling."],
  ["CANCELLATION_REASON_REQUIRED", "Add a short reason for cancelling."],
  ["INVALID_NARRATIVE", "Describe the issue in at least 10 characters."],
  ["DISPUTE_ALREADY_OPEN", "This booking is already under review. View the existing case."],
  ["DISPUTE_WINDOW_CLOSED", "The seven-day window to dispute this booking has closed."],
  ["DISPUTE_NOT_ALLOWED", "This booking can’t be disputed right now."],
  ["NO_SHOW_NOT_APPLICABLE", "A no-show report needs the start time to have passed with no arrival."],
  ["DISPUTE_NOT_FOUND", "There’s no open dispute for this booking."],
  ["DISPUTE_ALREADY_RESOLVED", "This dispute is already resolved."],
  ["AUDIT_NOTE_REQUIRED", "Add a resolution note before saving."],
  ["INVOICE_REQUIRED", "This resolution needs a submitted invoice."],
  ["REDUCTION_NOT_LOWER", "Reduced time must be less than the submitted time."],
  ["NOTHING_TO_WAIVE", "There’s no remaining balance to waive."],
  ["UNKNOWN_RESOLUTION", "Pick a valid resolution."],
];

export function requestOperationMessage(
  error: Pick<PostgrestError, "message"> | null,
  fallback = "Could not update the request. Try again.",
) {
  if (!error) return fallback;
  return (
    REQUEST_ERROR_MESSAGES.find(([code]) => error.message.includes(code))?.[1] ??
    fallback
  );
}

/**
 * Opportunistically release hourly acceptances whose first-hour payment window
 * has closed. Idempotent and participant-authorized in the DB, so it is safe to
 * call from a dashboard render; Phase 7 schedules the same operation. Returns
 * the ids that transitioned to `expired`.
 */
export async function releaseExpiredAcceptances(
  supabase: ServerClient,
  rows: Array<{
    id: string;
    booking_flow: string;
    status: string;
    initial_payment_due_at: string | null;
  }>,
): Promise<Set<string>> {
  const now = Date.now();
  const stale = rows.filter(
    (row) =>
      row.booking_flow === "hourly_v1" &&
      row.status === "accepted" &&
      row.initial_payment_due_at != null &&
      new Date(row.initial_payment_due_at).getTime() <= now,
  );
  const expired = new Set<string>();
  await Promise.all(
    stale.map(async (row) => {
      const { data } = await supabase.rpc("expire_unpaid_acceptance", {
        p_booking_id: row.id,
      });
      if (data === "expired") expired.add(row.id);
    }),
  );
  return expired;
}

export async function createHourlyRequest(
  supabase: ServerClient,
  input: {
    providerServiceId: string;
    scheduledAt: string;
    estimatedMinutes: number;
    responseWindowHours: number;
    address: string;
    jobZip: string;
    addressKind: "home" | "other";
    serviceCity: string;
    latitude: number | null;
    longitude: number | null;
    details: string;
  },
) {
  return supabase.rpc("create_hourly_booking_request", {
    p_provider_service_id: input.providerServiceId,
    p_scheduled_at: input.scheduledAt,
    p_estimated_minutes: input.estimatedMinutes,
    p_response_window_hours: input.responseWindowHours,
    p_address: input.address,
    p_job_zip: input.jobZip,
    p_details: input.details,
    p_address_kind: input.addressKind,
    p_service_city: input.serviceCity,
    p_latitude: input.latitude ?? undefined,
    p_longitude: input.longitude ?? undefined,
  });
}

export async function createQuoteRequest(
  supabase: ServerClient,
  input: {
    providerServiceId: string;
    scheduledAt: string;
    estimatedMinutes: number;
    responseWindowHours: number;
    address: string;
    jobZip: string;
    addressKind: "home" | "other";
    serviceCity: string;
    latitude: number | null;
    longitude: number | null;
    details: string;
  },
) {
  return supabase.rpc("create_quote_booking_request", {
    p_provider_service_id: input.providerServiceId,
    p_scheduled_at: input.scheduledAt,
    p_estimated_minutes: input.estimatedMinutes,
    p_response_window_hours: input.responseWindowHours,
    p_address: input.address,
    p_job_zip: input.jobZip,
    p_details: input.details,
    p_address_kind: input.addressKind,
    p_service_city: input.serviceCity,
    p_latitude: input.latitude ?? undefined,
    p_longitude: input.longitude ?? undefined,
  });
}

export async function replaceHourlyRequest(
  supabase: ServerClient,
  input: {
    originalBookingId: string;
    providerServiceId: string;
    responseWindowHours: number;
  },
) {
  return supabase.rpc("replace_hourly_booking_request", {
    p_original_booking_id: input.originalBookingId,
    p_provider_service_id: input.providerServiceId,
    p_response_window_hours: input.responseWindowHours,
  });
}

export async function getReplacementCandidateIds(
  supabase: ServerClient,
  bookingId: string,
) {
  const { data, error } = await supabase.rpc(
    "hourly_replacement_candidate_ids",
    { p_booking_id: bookingId },
  );
  if (error) throw new Error(requestOperationMessage(error));
  return data ?? [];
}

/** Server-only ZIP ranking. The browser receives ordered IDs, never ZIP facts. */
export async function getLocationRankedProviderIds(input: {
  jobZip: string;
  serviceSlug?: string;
}) {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("rank_hourly_provider_ids", {
    p_job_zip: input.jobZip,
    p_service_slug: input.serviceSlug,
  });
  if (error) return [];
  return (data ?? []).map((row) => row.provider_id);
}
