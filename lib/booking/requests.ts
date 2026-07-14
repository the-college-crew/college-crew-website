import "server-only";

import type { PostgrestError } from "@supabase/supabase-js";

import { createAdminClient } from "@/lib/supabase/admin";
import type { createClient } from "@/lib/supabase/server";

type ServerClient = Awaited<ReturnType<typeof createClient>>;

const REQUEST_ERROR_MESSAGES: Array<[string, string]> = [
  ["AUTHENTICATION_REQUIRED", "Log in to continue."],
  ["CUSTOMER_ROLE_REQUIRED", "Only customer accounts can request bookings."],
  ["EMAIL_CONFIRMATION_REQUIRED", "Confirm your email before requesting a booking."],
  ["CUSTOMER_NAME_REQUIRED", "Add your name in account settings before booking."],
  ["OFFERING_NOT_BOOKABLE", "That service is no longer available to book."],
  ["INVALID_DURATION", "Choose an estimate from 1 to 12 hours in 15-minute steps."],
  ["INVALID_RESPONSE_WINDOW", "Choose a response window that ends before the job."],
  ["RESPONSE_WINDOW_REACHES_START", "Choose a shorter response window."],
  ["INVALID_JOB_ZIP", "Enter a five-digit job ZIP."],
  ["INVALID_JOB_ADDRESS", "Enter the complete service address."],
  ["DETAILS_TOO_LONG", "Keep job details to 2,000 characters or fewer."],
  ["MINIMUM_NOTICE_NOT_MET", "This job no longer meets the provider’s scheduling notice."],
  ["OUTSIDE_PROVIDER_AVAILABILITY", "The full job estimate must fit the provider’s availability."],
  ["PROVIDER_SLOT_ALREADY_RESERVED", "That provider just reserved another job during this time."],
  ["PROVIDER_NO_LONGER_READY", "This provider cannot accept new hourly work right now."],
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

export async function createHourlyRequest(
  supabase: ServerClient,
  input: {
    providerServiceId: string;
    scheduledAt: string;
    estimatedMinutes: number;
    responseWindowHours: number;
    address: string;
    jobZip: string;
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
