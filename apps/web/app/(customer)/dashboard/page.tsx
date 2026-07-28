import type { Metadata } from "next";
import Link from "next/link";

import { openConversationForBooking } from "@/app/actions/messaging";
import { BookingCopyProvider } from "@/components/content/booking-copy-provider";
import { SamplePreviewBanner } from "@/components/sample-preview-banner";
import { JobPhotoGrid } from "@/components/booking/job-photo-grid";
import { DeadlineCountdown } from "@/components/deadline-countdown";
import { StatusPill } from "@/components/status-pill";
import { Button, buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { RealtimeRefresh } from "@/components/realtime-refresh";
import { requireRole } from "@/lib/auth/session";
import {
  ATTENTION_LABELS,
  needsReplacement,
  partitionBookings,
  UPCOMING_STATUSES,
  type BookingGroups,
  type DashboardBooking,
} from "@/lib/booking/dashboard-groups";
import { sweepInstantBookHolds } from "@/lib/booking/first-hour-hold";
import {
  CUSTOMER_REFUND_NOTICE_HOURS,
  LATE_DISPUTE_DAYS,
} from "@/lib/booking/policy";
import {
  pickSuggestions,
  type ReplacementSuggestion,
} from "@/lib/booking/replacement-ranking";
import { getReplacementPool } from "@/lib/booking/replacement-suggestions";
import { releaseExpiredAcceptances } from "@/lib/booking/requests";
import {
  bookingCopyValue,
  type BookingCopyOverrides,
} from "@/lib/content/booking-copy";
import { getBookingCopyOverrides } from "@/lib/content/booking-copy.server";
import { demoBookings, getDemoPreview } from "@/lib/demo/sample-preview";
import { bookingJobPhotos } from "@/lib/media/job-photos";
import {
  getCustomerConversationIndex,
  type ConversationEntry,
} from "@/lib/messaging/summaries";
import { createClient } from "@/lib/supabase/server";
import { cn, formatDateTime, formatLocalDate, formatMoney } from "@/lib/utils";

import { CancelBookingButton } from "./cancel-booking-button";
import { DismissBookingButton } from "./dismiss-booking-button";
import { QuickBookSuggestions } from "./quick-book-suggestions";
import { ReviewForm } from "./review-form";

export const metadata: Metadata = { title: "My bookings" };

/**
 * How many attention cards get live replacement suggestions. Each one costs two
 * RPCs plus a directory read, so the fan-out is bounded; anything past this
 * still links out to the full replacement page.
 */
const SUGGESTION_CARD_LIMIT = 5;

type SuggestionIndex = Map<string, ReplacementSuggestion[]>;

/**
 * Look up quick-book suggestions for the attention cards that lost their
 * student. Runs in parallel and swallows failures per card: a booking the
 * database won't offer alternatives for should render without them, not break
 * the page.
 */
async function getSuggestionIndex(
  supabase: Awaited<ReturnType<typeof createClient>>,
  attention: DashboardBooking[],
): Promise<SuggestionIndex> {
  const targets = attention
    .filter(
      (booking) =>
        booking.booking_flow === "hourly_v1" &&
        booking.scheduled_at != null &&
        needsReplacement(booking.attentionReason),
    )
    .slice(0, SUGGESTION_CARD_LIMIT);

  const entries = await Promise.all(
    targets.map(async (booking) => {
      try {
        const pool = await getReplacementPool(supabase, {
          id: booking.id,
          serviceSlug: booking.service.slug,
        });
        return [
          booking.id,
          pickSuggestions(pool, booking.scheduled_at!),
        ] as const;
      } catch {
        return [booking.id, [] as ReplacementSuggestion[]] as const;
      }
    }),
  );

  return new Map(entries.filter(([, list]) => list.length > 0));
}

export default async function CustomerDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{
    tab?: string;
    requested?: string;
    replaced?: string;
    paid?: string;
    reviewed?: string;
  }>;
}) {
  const [
    { tab, requested, replaced, paid, reviewed },
    session,
    copyOverrides,
  ] = await Promise.all([
    searchParams,
    requireRole("customer", "/dashboard"),
    getBookingCopyOverrides("customer"),
  ]);
  const showPast = tab === "past";
  const now = new Date();
  const demoPreview = await getDemoPreview("customer");

  if (demoPreview) {
    // The demo path never resolves a real conversation, so it passes an empty
    // index and the sample rows' shape difference is safe here.
    const groups = partitionBookings(
      demoBookings as unknown as DashboardBooking[],
      now,
    );
    return (
      <BookingCopyProvider overrides={copyOverrides}>
        <CustomerDashboardView
          groups={groups}
          showPast={showPast}
          requested={requested}
          replaced={replaced}
          paid={paid}
          convoIndex={new Map()}
          suggestions={new Map()}
          copyOverrides={copyOverrides}
          demo
        />
      </BookingCopyProvider>
    );
  }

  const supabase = await createClient();
  const [{ data }, { data: reviewRows }] = await Promise.all([
    supabase
      .from("bookings")
      .select(
        `id, booking_flow, status, scheduled_at, requested_local_date,
         requested_daypart, address, price_cents,
         estimated_minutes, hourly_rate_cents_snapshot,
         average_quote_cents_snapshot, job_photos, response_alert_at,
         initial_payment_due_at, en_route_at, dismissed_at,
         review_prompt_dismissed_at, work_completed_at, cancelled_by_role,
         proposed_start_at, counter_note, provider_id,
         service:services(name, slug),
         provider:provider_profiles(display_name),
         invoice:booking_invoices(status, remaining_balance_cents, resolved_at),
         dispute:booking_disputes(id, status)`,
      )
      .eq("customer_id", session.user.id)
      .order("scheduled_at", { ascending: showPast ? false : true }),
    supabase.rpc("get_my_booking_reviews"),
  ]);

  const reviewByBooking = new Map(
    (reviewRows ?? []).map((review) => [
      review.booking_id,
      { id: review.review_id },
    ]),
  );
  const rows = (data ?? []).map((booking) => ({
    ...booking,
    review: reviewByBooking.get(booking.id) ?? null,
  })) as DashboardBooking[];
  // Query-string feedback is trusted only when the scoped review RPC confirms
  // this customer owns the reviewed booking relationship.
  const confirmedReviewedId =
    reviewed && reviewByBooking.has(reviewed) ? reviewed : undefined;
  // Instant-book: expire any request past its 2h window and release the held
  // first hour for requests that ended without acceptance, then reflect the new
  // status before partitioning (the scheduler does this too; this is the
  // opportunistic backstop, with Stripe's 7-day hold expiry as the final one).
  const [staleAcceptances, expiredRequests] = await Promise.all([
    releaseExpiredAcceptances(supabase, rows),
    sweepInstantBookHolds(supabase, rows),
  ]);
  const expiredIds = new Set([...staleAcceptances, ...expiredRequests]);
  const groups = partitionBookings(
    rows.map((row) =>
      expiredIds.has(row.id) ? { ...row, status: "expired" as const } : row,
    ),
    now,
  );
  const [convoIndex, suggestions] = await Promise.all([
    getCustomerConversationIndex(supabase, session.user.id),
    getSuggestionIndex(supabase, groups.attention),
  ]);

  return (
    <BookingCopyProvider overrides={copyOverrides}>
      <CustomerDashboardView
        groups={groups}
        showPast={showPast}
        requested={requested}
        replaced={replaced}
        paid={paid}
        reviewed={confirmedReviewedId}
        convoIndex={convoIndex}
        suggestions={suggestions}
        customerId={session.user.id}
        copyOverrides={copyOverrides}
      />
    </BookingCopyProvider>
  );
}

function CustomerDashboardView({
  groups,
  showPast,
  requested,
  replaced,
  paid,
  reviewed,
  convoIndex,
  suggestions,
  customerId,
  copyOverrides,
  demo = false,
}: {
  groups: BookingGroups;
  showPast: boolean;
  requested?: string;
  replaced?: string;
  paid?: string;
  reviewed?: string;
  convoIndex: Map<string, ConversationEntry>;
  suggestions: SuggestionIndex;
  customerId?: string;
  copyOverrides: BookingCopyOverrides;
  demo?: boolean;
}) {
  const copy = (
    key: Parameters<typeof bookingCopyValue>[1],
    values?: Record<string, string | number>,
  ) => bookingCopyValue(copyOverrides, key, values);
  const { attention, reviewable, upcoming, past } = groups;
  const list = showPast ? past : upcoming;
  const showAttention = !showPast && attention.length > 0;
  const showReviewable = !showPast && reviewable.length > 0;
  // Everything that lands on the Upcoming tab, so the count matches the page.
  const upcomingCount = upcoming.length + attention.length;

  const tabClass = (active: boolean) =>
    cn(
      "rounded-lg px-4 py-2 text-sm font-semibold transition-colors",
      active ? "bg-crew-600 text-white" : "text-ink-soft hover:bg-crew-50",
    );

  return (
    <div className="space-y-6">
      {demo ? null : (
        <>
          <RealtimeRefresh
            channel={`customer-bookings:${customerId}`}
            table="bookings"
            filter={`customer_id=eq.${customerId}`}
          />
          <RealtimeRefresh
            channel={`customer-invoices:${customerId}`}
            table="booking_invoices"
          />
          <RealtimeRefresh
            channel={`customer-disputes:${customerId}`}
            table="booking_disputes"
          />
        </>
      )}
      <PageHeader
        title={copy("booking-customer.dashboard.title")}
        actions={
          <Link
            href={demo ? "/book/demo" : "/browse"}
            className={buttonClasses({ size: "sm" })}
          >
            Book something new
          </Link>
        }
      />
      {demo ? <SamplePreviewBanner role="customer" /> : null}

      {requested ? (
        <div className="rounded-lg border border-quad-200 bg-quad-50 p-4 text-sm text-quad-800">
          {demo
            ? "Sample request sent. No booking was created, but this is where the confirmation appears."
            : requested === "quote"
              ? copy("booking-customer.dashboard.quote-request-sent")
              : copy("booking-customer.dashboard.request-sent")}
        </div>
      ) : null}
      {replaced ? (
        <div className="rounded-lg border border-quad-200 bg-quad-50 p-4 text-sm text-quad-800">
          Replacement sent. The original request was withdrawn atomically.
        </div>
      ) : null}
      {paid ? (
        <div className="rounded-lg border border-quad-200 bg-quad-50 p-4 text-sm text-quad-800">
          {demo
            ? "Sample payment confirmed. No payment was created."
            : copy("booking-customer.dashboard.booking-confirmed")}
        </div>
      ) : null}
      {reviewed ? (
        <div
          role="status"
          className="rounded-lg border border-quad-200 bg-quad-50 p-4 text-sm text-quad-800"
        >
          Thanks! Your review is live on the provider&apos;s profile.
        </div>
      ) : null}

      <div
        role="tablist"
        aria-label="Booking filters"
        className="inline-flex gap-1 rounded-xl border border-line bg-court p-1"
      >
        <Link
          role="tab"
          aria-selected={!showPast}
          href="/dashboard"
          className={tabClass(!showPast)}
        >
          Upcoming{upcomingCount > 0 ? ` (${upcomingCount})` : ""}
        </Link>
        <Link
          role="tab"
          aria-selected={showPast}
          href="/dashboard?tab=past"
          className={tabClass(showPast)}
        >
          Past{past.length > 0 ? ` (${past.length})` : ""}
        </Link>
      </div>

      {showAttention ? (
        <section aria-label="Needs attention" className="space-y-3">
          <h2 className="flex items-center gap-2 font-display text-sm font-semibold text-red-800">
            <span aria-hidden>⚠</span>{" "}
            {copy("booking-customer.dashboard.needs-attention")}
          </h2>
          <ul className="space-y-4">
            {attention.map((booking) => (
              <li key={booking.id}>
                <BookingCard
                  booking={booking}
                  demo={demo}
                  convo={demo ? undefined : convoIndex.get(booking.id)}
                  suggestions={suggestions.get(booking.id) ?? []}
                  copyOverrides={copyOverrides}
                  attention
                />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {showReviewable ? (
        <section aria-label="Waiting for your review" className="space-y-3">
          <div>
            <h2 className="font-display text-lg font-semibold text-ink">
              {copy("booking-customer.dashboard.awaiting-review")}
            </h2>
            <p className="mt-1 text-sm text-ink-soft">
              Your review helps neighbors choose confidently and helps students
              build a track record. You can come back and review anytime.
            </p>
          </div>
          <ul className="space-y-4">
            {reviewable.map((booking) => (
              <li key={booking.id}>
                <BookingCard
                  booking={booking}
                  demo={demo}
                  convo={demo ? undefined : convoIndex.get(booking.id)}
                  suggestions={[]}
                  copyOverrides={copyOverrides}
                  reviewPrompt
                />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {list.length > 0 ? (
        <section aria-label={showPast ? "Past bookings" : "Scheduled"} className="space-y-3">
          {/* With attention and review sections above it, a bare list is
              ambiguous — name what these are. */}
          {showAttention || showReviewable ? (
            <h2 className="font-display text-lg font-semibold text-ink">
              {showPast
                ? "Past"
                : copy("booking-customer.dashboard.scheduled")}
            </h2>
          ) : null}
          <ul className="space-y-4">
            {list.map((booking) => (
              <li key={booking.id}>
                <BookingCard
                  booking={booking}
                  demo={demo}
                  convo={demo ? undefined : convoIndex.get(booking.id)}
                  suggestions={[]}
                  copyOverrides={copyOverrides}
                />
              </li>
            ))}
          </ul>
        </section>
      ) : showPast || (!showAttention && !showReviewable) ? (
        <EmptyState
          title={
            showPast
              ? "No past bookings"
              : copy("booking-customer.dashboard.empty-title")
          }
          action={
            <Link
              href={demo ? "/book/demo" : "/browse"}
              className={buttonClasses({ variant: "secondary", size: "sm" })}
            >
              Browse the crew
            </Link>
          }
        >
          {showPast
            ? "Completed and closed bookings will show up here."
            : copy("booking-customer.dashboard.empty-body")}
        </EmptyState>
      ) : (
        // Only attention/review items exist: say plainly that the calendar is
        // clear, instead of leaving the reader to infer it.
        <p className="rounded-xl border border-dashed border-line px-4 py-3 text-sm text-ink-soft">
          Nothing else is scheduled right now.
        </p>
      )}
    </div>
  );
}

/**
 * One booking card, shared by the attention, review, upcoming, and past lists.
 *
 * An attention card leads with a chip naming what happened, then the specific
 * explanation, then the way out: for a job that lost its student that's a
 * quick-book shortlist (details already saved), "Other options", and Dismiss.
 * Any booking with an existing conversation keeps a "Message" button, past ones
 * included.
 */
function BookingCard({
  booking,
  demo,
  convo,
  suggestions,
  attention = false,
  reviewPrompt = false,
  copyOverrides,
}: {
  booking: DashboardBooking;
  demo: boolean;
  convo?: ConversationEntry;
  suggestions: ReplacementSuggestion[];
  attention?: boolean;
  reviewPrompt?: boolean;
  copyOverrides: BookingCopyOverrides;
}) {
  const copy = (
    key: Parameters<typeof bookingCopyValue>[1],
    values?: Record<string, string | number>,
  ) => bookingCopyValue(copyOverrides, key, values);
  const providerName = booking.provider.display_name;
  const reason = booking.attentionReason;
  const isDeclined = booking.status === "declined";
  const isCountered = booking.status === "countered";
  const isProviderCancelled =
    booking.status === "cancelled" && booking.cancelled_by_role === "provider";
  const isUpcoming = (UPCOMING_STATUSES as string[]).includes(booking.status);
  const isHourly = booking.booking_flow === "hourly_v1";
  const isQuote = ["quote_v1", "quote_v2"].includes(booking.booking_flow);
  const usesPostJobPayment =
    isHourly || booking.booking_flow === "quote_v2";
  const responseAlertReached = booking.responseAlertReached === true;
  const note = convo?.latest?.fromOther ? convo.latest : null;
  const hasProviderMessage = Boolean(note);
  // Where "Other options" goes: the full replacement list for a job we can
  // rebook in place, otherwise a fresh browse.
  const otherOptionsHref =
    !demo && usesPostJobPayment && needsReplacement(reason)
      ? `/bookings/${booking.id}/replace`
      : demo
        ? "/book/demo"
        : "/browse";

  // Cancellation + dispute eligibility (Phase 6). The RPCs re-check everything
  // atomically; this only drives what the card offers and the outcome preview.
  const nowMs = new Date().getTime();
  const startMs = booking.scheduled_at
    ? new Date(booking.scheduled_at).getTime()
    : Number.POSITIVE_INFINITY;
  const startPassed = startMs <= nowMs;
  const legacyCancel =
    !usesPostJobPayment &&
    (booking.status === "requested" || booking.status === "accepted");
  const hourlyCancel =
    usesPostJobPayment &&
    !demo &&
    (booking.status === "requested" ||
      booking.status === "accepted" ||
      (booking.status === "booked" && !startPassed));
  const cancelOutcome: "full_refund" | "no_refund" | "no_payment" | undefined =
    booking.status === "booked"
      ? startMs - nowMs >= CUSTOMER_REFUND_NOTICE_HOURS * 3_600_000
        ? "full_refund"
        : "no_refund"
      : booking.status === "requested" || booking.status === "accepted"
        ? "no_payment"
        : undefined;
  const cancelLabel =
    booking.status === "booked"
      ? copy("booking-customer.dashboard.cancel-booking")
      : copy("booking-customer.dashboard.cancel-request");

  const hasOpenDispute = booking.dispute?.status === "open";
  const finalChargeAt = booking.invoice?.resolved_at
    ? new Date(booking.invoice.resolved_at).getTime()
    : null;
  const withinLateWindow =
    finalChargeAt != null &&
    nowMs <= finalChargeAt + LATE_DISPUTE_DAYS * 24 * 3_600_000;
  const noShowEligible =
    usesPostJobPayment && booking.status === "booked" && startPassed;
  const disputeEligible =
    usesPostJobPayment &&
    !demo &&
    !hasOpenDispute &&
    (noShowEligible ||
      booking.status === "in_progress" ||
      booking.status === "invoice_review" ||
      (booking.status === "completed" && withinLateWindow));

  return (
    <Card
      id={`booking-${booking.id}`}
      data-booking-id={booking.id}
      data-dismissable-card={attention || reviewPrompt || undefined}
      className={cn(
        "p-5 transition-[opacity,transform] duration-200 ease-out",
        attention && "border-red-200",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          {reason ? (
            <p className="mb-1.5 inline-flex items-center rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-red-800">
              {ATTENTION_LABELS[reason]}
            </p>
          ) : null}
          <p className="font-display text-lg font-semibold">
            {booking.service.name}
          </p>
          <p className="mt-0.5 text-sm text-ink-soft">
            with {providerName} ·{" "}
            {booking.scheduled_at
              ? formatDateTime(booking.scheduled_at)
              : booking.requested_local_date && booking.requested_daypart
                ? `${formatLocalDate(booking.requested_local_date)} · ${booking.requested_daypart}`
                : "Exact time pending"}
          </p>
          <p className="mt-0.5 text-xs text-mist">
            {booking.address} ·{" "}
            {isHourly && booking.hourly_rate_cents_snapshot != null
              ? `${formatMoney(booking.hourly_rate_cents_snapshot)}/hr · ${booking.estimated_minutes ?? 60} min estimate`
              : isQuote && booking.status === "requested"
                ? booking.average_quote_cents_snapshot == null
                  ? copy("booking-customer.dashboard.quote-waiting")
                  : `Average shown ${formatMoney(booking.average_quote_cents_snapshot)} · final quote pending`
                : formatMoney(booking.price_cents)}
          </p>
        </div>
        <StatusPill status={booking.status} />
      </div>

      {isDeclined ? (
        <div
          role="alert"
          className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800"
        >
          <p className="font-semibold">{providerName} declined this request.</p>
          {note ? (
            <p className="mt-1 line-clamp-2 text-red-700">
              “{note.body}” - {providerName}
            </p>
          ) : (
            <p className="mt-1 text-red-700">
              Message them for details, or pick another student below.
            </p>
          )}
        </div>
      ) : null}

      {isCountered && booking.proposed_start_at ? (
        <div
          role="alert"
          className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
        >
          <p className="font-semibold">
            {providerName} suggested a different time.
          </p>
          <p className="mt-1">
            You asked for{" "}
            {booking.scheduled_at
              ? formatDateTime(booking.scheduled_at)
              : "the original time"}
            ; they can do{" "}
            <span className="font-semibold">
              {formatDateTime(booking.proposed_start_at)}
            </span>
            .
          </p>
          {booking.counter_note ? (
            <p className="mt-1 line-clamp-2 text-amber-800">
              “{booking.counter_note}”
            </p>
          ) : null}
        </div>
      ) : null}

      {isCountered && booking.booking_flow === "quote_v2" ? (
        <div
          role="alert"
          className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
        >
          <p className="font-semibold">
            {providerName} offered different date windows.
          </p>
          <p className="mt-1">
            Review up to three available options and choose one to send the
            saved request back.
          </p>
        </div>
      ) : null}

      {isHourly && booking.status === "booked" && booking.en_route_at ? (
        <div
          role="status"
          className="mt-4 rounded-lg border border-quad-200 bg-quad-50 p-4 text-sm text-quad-800"
        >
          <p className="font-semibold">{providerName} is on the way.</p>
          <p className="mt-1">They sent an on-my-way update for this booking.</p>
        </div>
      ) : null}

      {isProviderCancelled ? (
        <div
          role="alert"
          className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800"
        >
          <p className="font-semibold">{providerName} cancelled this booking.</p>
          <p className="mt-1 text-red-700">
            You&apos;ve been fully refunded. Your job details are saved — pick
            another verified student below.
          </p>
        </div>
      ) : null}

      {responseAlertReached ? (
        <div
          role="status"
          className="mt-4 rounded-lg border border-gold-300 bg-gold-100 p-4 text-sm text-gold-800"
        >
          <p className="font-semibold">
            {copy("booking-customer.dashboard.response-passed")}
          </p>
          <p className="mt-1">
            Your original request is still open. You can keep waiting, cancel,
            or atomically send one replacement request.
          </p>
        </div>
      ) : null}

      {suggestions.length > 0 && booking.scheduled_at ? (
        <QuickBookSuggestions
          bookingId={booking.id}
          suggestions={suggestions}
          originalStartAt={booking.scheduled_at}
        />
      ) : null}

      {isHourly && booking.status === "requested" && booking.response_alert_at ? (
        <div className="mt-3">
          <DeadlineCountdown
            target={booking.response_alert_at}
            label="Response alert"
          />
        </div>
      ) : null}

      {isQuote ? (
        <JobPhotoGrid
          photos={bookingJobPhotos(booking.job_photos)}
          label={copy("booking-customer.dashboard.photo-label")}
          unavailableText={copy(
            "booking-customer.dashboard.photos-unavailable",
          )}
        />
      ) : null}

      {isQuote && booking.status === "requested" ? (
        <div className="mt-3 rounded-lg border border-gold-300 bg-gold-100 p-3 text-xs leading-5 text-gold-900">
          {copy("booking-customer.dashboard.quote-media-note")}
        </div>
      ) : null}

      {isQuote && booking.status === "accepted" ? (
        <div className="mt-3 rounded-lg border border-quad-200 bg-quad-50 p-3 text-sm text-quad-800">
          Final flat quote:{" "}
          <span className="font-semibold">
            {formatMoney(booking.price_cents)}
          </span>
        </div>
      ) : null}

      {isHourly &&
      booking.status === "accepted" &&
      booking.initial_payment_due_at ? (
        <div className="mt-3">
          <DeadlineCountdown
            target={booking.initial_payment_due_at}
            label="First-hour payment due"
          />
        </div>
      ) : null}

      {isHourly &&
      booking.status === "invoice_review" &&
      booking.invoice?.status === "requires_action" ? (
        <div
          role="alert"
          className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800"
        >
          <p className="font-semibold">
            {copy("booking-customer.dashboard.balance-attention")}
          </p>
          <p className="mt-1">
            The final charge didn&apos;t go through. Review the invoice and
            update your payment method.
          </p>
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {booking.status === "accepted" && !isHourly ? (
          <Link
            href={
              demo ? "/bookings/demo/confirm" : `/bookings/${booking.id}/confirm`
            }
            className={buttonClasses({ size: "sm" })}
          >
            Confirm & pay
          </Link>
        ) : null}

        {booking.status === "accepted" && isHourly && demo ? (
          <span className="rounded-lg border border-sky bg-sky px-3 py-1.5 text-xs font-medium text-viridian">
            Accepted · pay the first hour
          </span>
        ) : booking.status === "accepted" && isHourly ? (
          <Link
            href={`/bookings/${booking.id}/confirm`}
            className={buttonClasses({ size: "sm" })}
          >
            Pay first hour
          </Link>
        ) : null}

        {isHourly && booking.status === "invoice_review" && !demo ? (
          <Link
            href={`/bookings/${booking.id}/invoice`}
            className={buttonClasses({ size: "sm" })}
          >
            {booking.invoice?.status === "requires_action"
              ? "Fix payment"
              : copy("booking-customer.dashboard.review-pay")}
          </Link>
        ) : null}

        {isCountered && !demo ? (
          <Link
            href={`/bookings/${booking.id}/counter`}
            className={buttonClasses({ size: "sm" })}
          >
            {booking.booking_flow === "quote_v2"
              ? "Review date options"
              : "Review new time"}
          </Link>
        ) : null}

        {demo && (isDeclined || isUpcoming) ? (
          <Link
            href="/messages/demo"
            className={buttonClasses({
              variant: hasProviderMessage ? "primary" : "secondary",
              size: "sm",
            })}
          >
            {hasProviderMessage ? "Read message" : "Message"}
          </Link>
        ) : !demo && (isDeclined || isCountered || isUpcoming) ? (
          <form action={openConversationForBooking}>
            <input type="hidden" name="bookingId" value={booking.id} />
            <button
              type="submit"
              className={buttonClasses({
                variant: hasProviderMessage ? "primary" : "secondary",
                size: "sm",
              })}
            >
              {hasProviderMessage ? "Read message" : "Message"}
            </button>
          </form>
        ) : null}

        {/* A job that lost its student: the shortlist above is the main path,
            so this is the way to see everyone rather than a primary action. */}
        {needsReplacement(reason) ? (
          <Link
            href={otherOptionsHref}
            className={buttonClasses({
              variant: suggestions.length > 0 ? "secondary" : "primary",
              size: "sm",
            })}
          >
            Other options
          </Link>
        ) : null}

        {demo &&
        (booking.status === "requested" || booking.status === "accepted") ? (
          <Button type="button" variant="danger" size="sm" disabled>
            Cancel request
          </Button>
        ) : legacyCancel ? (
          <CancelBookingButton bookingId={booking.id} />
        ) : hourlyCancel ? (
          <CancelBookingButton
            bookingId={booking.id}
            outcome={cancelOutcome}
            label={cancelLabel}
          />
        ) : null}

        {hasOpenDispute && !demo ? (
          <Link
            href={`/bookings/${booking.id}/dispute`}
            className={buttonClasses({ variant: "secondary", size: "sm" })}
          >
            View case
          </Link>
        ) : disputeEligible ? (
          <Link
            href={
              noShowEligible
                ? `/bookings/${booking.id}/dispute?category=provider_no_show`
                : `/bookings/${booking.id}/dispute`
            }
            className={buttonClasses({ variant: "secondary", size: "sm" })}
          >
            {noShowEligible
              ? copy("booking-customer.dashboard.report-no-show")
              : copy("booking-customer.dashboard.report-problem")}
          </Link>
        ) : null}

        {/* Repeat business: rebook the same student and service with the job
            details prefilled. */}
        {booking.status === "completed" && !demo && booking.provider_id ? (
          <Link
            href={`/book/${booking.provider_id}?again=${booking.id}`}
            className={buttonClasses({ variant: "secondary", size: "sm" })}
          >
            Book again
          </Link>
        ) : null}

        {/* Dismissal clears the card out of Needs attention; the booking stays
            under Past. Not offered for a countered request — that needs a
            decision, not a shrug. */}
        {attention && !demo && !isCountered ? (
          <DismissBookingButton bookingId={booking.id} />
        ) : null}
      </div>

      {booking.status === "completed" ? (
        <div className="mt-4 border-t border-line pt-4">
          {demo ? (
            <Button type="button" variant="secondary" size="sm" disabled>
              Leave review
            </Button>
          ) : booking.review ? (
            <p className="text-sm font-medium text-quad-700">Reviewed ✓</p>
          ) : (
            <div className="space-y-2">
              <ReviewForm bookingId={booking.id} collapsible={reviewPrompt} />
              {reviewPrompt ? (
                <DismissBookingButton
                  bookingId={booking.id}
                  target="review-prompt"
                  label="Not now"
                  pendingLabel="Clearing…"
                />
              ) : null}
            </div>
          )}
        </div>
      ) : null}
    </Card>
  );
}
