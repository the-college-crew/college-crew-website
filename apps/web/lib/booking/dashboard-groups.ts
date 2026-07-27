import type { BookingFlow, BookingStatus, Json } from "@/lib/db/types";

/**
 * Grouping rules for the customer's "My bookings" page.
 *
 * Kept out of the page component so the rules are unit-testable: which card
 * lands in Needs attention, which review prompts are still worth showing, and
 * what stays visible under Past. The page renders these groups and nothing more.
 */

/** How long after the job we keep asking for a review. */
export const REVIEW_PROMPT_WINDOW_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Why a booking needs the customer to do something. Each one gets its own
 * chip + copy on the card, so "cancelled", "declined", "new time proposed" and
 * "nobody answered" never read as the same problem.
 */
export type AttentionReason =
  | "provider_cancelled"
  | "declined"
  | "countered"
  | "no_response";

/** Ordered most- to least-urgent for ties at the same scheduled time. */
const REASON_PRIORITY: Record<AttentionReason, number> = {
  countered: 0,
  provider_cancelled: 1,
  declined: 2,
  no_response: 3,
};

export const UPCOMING_STATUSES: BookingStatus[] = [
  "requested",
  "accepted",
  "paid",
  "booked",
  "in_progress",
  "invoice_review",
  "disputed",
];

export type DashboardBooking = {
  id: string;
  booking_flow: BookingFlow;
  status: BookingStatus;
  scheduled_at: string;
  address: string;
  price_cents: number;
  estimated_minutes: number | null;
  hourly_rate_cents_snapshot: number | null;
  average_quote_cents_snapshot: number | null;
  /** Quote requests only; absent in the sample-preview fixtures. */
  job_photos?: Json;
  response_alert_at: string | null;
  initial_payment_due_at: string | null;
  en_route_at: string | null;
  dismissed_at: string | null;
  review_prompt_dismissed_at: string | null;
  work_completed_at: string | null;
  cancelled_by_role: string | null;
  proposed_start_at: string | null;
  counter_note: string | null;
  /** Present on real rows; absent in the sample-preview fixtures. */
  provider_id?: string;
  service: { name: string; slug: string };
  provider: { display_name: string };
  review: { id: string } | null;
  invoice: {
    status: string;
    remaining_balance_cents: number;
    resolved_at: string | null;
  } | null;
  dispute: { id: string; status: string } | null;
  /** Set by the grouper when an hourly request blew its response deadline. */
  responseAlertReached?: boolean;
  /** Set by the grouper for every booking placed in the attention group. */
  attentionReason?: AttentionReason;
};

export type BookingGroups = {
  attention: DashboardBooking[];
  reviewable: DashboardBooking[];
  upcoming: DashboardBooking[];
  past: DashboardBooking[];
};

/**
 * Classify a booking that is waiting on the customer. Returns null when the
 * booking needs nothing from them.
 */
function attentionReasonFor(
  booking: DashboardBooking,
  now: Date,
): AttentionReason | null {
  // A dismissed booking has been explicitly cleared; it lives in Past only.
  if (booking.dismissed_at) return null;
  const startsInFuture = new Date(booking.scheduled_at) >= now;

  // The provider proposed a different time and the job is still ahead of us.
  // This one has a real decision attached, so it outranks the others.
  if (
    booking.status === "countered" &&
    booking.proposed_start_at != null &&
    startsInFuture
  ) {
    return "countered";
  }
  if (booking.status === "declined" && startsInFuture) return "declined";
  if (
    booking.status === "cancelled" &&
    booking.cancelled_by_role === "provider" &&
    startsInFuture
  ) {
    return "provider_cancelled";
  }
  if (booking.responseAlertReached) return "no_response";
  return null;
}

/**
 * Should we still ask for a review? Only for a completed, unreviewed job the
 * customer hasn't skipped, within the prompt window, and with no open dispute —
 * a job you're actively contesting is not one to rate.
 */
function isReviewPromptOpen(booking: DashboardBooking, now: Date): boolean {
  if (booking.status !== "completed") return false;
  if (booking.review) return false;
  if (booking.review_prompt_dismissed_at) return false;
  if (booking.dispute?.status === "open") return false;
  const finishedAt = new Date(booking.work_completed_at ?? booking.scheduled_at);
  return now.getTime() - finishedAt.getTime() <= REVIEW_PROMPT_WINDOW_DAYS * DAY_MS;
}

/**
 * Split bookings into their dashboard groups.
 *
 * Completed bookings always stay in Past; an unreviewed one is *additionally*
 * surfaced on the default view while its review prompt is open. Dismissed
 * bookings drop out of attention but remain under Past, so a cancellation keeps
 * its paper trail (there may be a refund attached to it).
 */
export function partitionBookings(
  bookings: DashboardBooking[],
  now: Date,
): BookingGroups {
  const attention: DashboardBooking[] = [];
  const reviewable: DashboardBooking[] = [];
  const upcoming: DashboardBooking[] = [];
  const past: DashboardBooking[] = [];

  for (const source of bookings) {
    const responseAlertReached = Boolean(
      source.booking_flow === "hourly_v1" &&
        source.status === "requested" &&
        source.response_alert_at &&
        new Date(source.response_alert_at) <= now &&
        new Date(source.scheduled_at) > now,
    );
    // An hourly request whose start time passed without an answer reads as
    // expired, whatever the row still says.
    const booking: DashboardBooking =
      source.booking_flow === "hourly_v1" &&
      source.status === "requested" &&
      new Date(source.scheduled_at) <= now
        ? { ...source, status: "expired", responseAlertReached: false }
        : { ...source, responseAlertReached };

    if (isReviewPromptOpen(booking, now)) reviewable.push(booking);

    const reason = attentionReasonFor(booking, now);
    if (reason) {
      attention.push({ ...booking, attentionReason: reason });
    } else if (!booking.dismissed_at && UPCOMING_STATUSES.includes(booking.status)) {
      upcoming.push(booking);
    } else {
      past.push(booking);
    }
  }

  return {
    attention: sortByUrgency(attention),
    reviewable,
    upcoming,
    past,
  };
}

/**
 * Soonest job first — an item you can still act on beats one that already
 * slipped past. Ties break on how consequential the reason is.
 */
function sortByUrgency(bookings: DashboardBooking[]): DashboardBooking[] {
  return [...bookings].sort((a, b) => {
    const byTime =
      new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime();
    if (byTime !== 0) return byTime;
    return (
      REASON_PRIORITY[a.attentionReason ?? "no_response"] -
      REASON_PRIORITY[b.attentionReason ?? "no_response"]
    );
  });
}

/** Chip label + copy for an attention card. */
export const ATTENTION_LABELS: Record<AttentionReason, string> = {
  provider_cancelled: "Cancelled by your student",
  declined: "Request declined",
  countered: "New time suggested",
  no_response: "No response yet",
};

/**
 * Attention reasons where the job itself is still wanted but has no student —
 * the cases worth offering replacement suggestions for.
 */
export function needsReplacement(reason: AttentionReason | undefined): boolean {
  return (
    reason === "provider_cancelled" ||
    reason === "declined" ||
    reason === "no_response"
  );
}
