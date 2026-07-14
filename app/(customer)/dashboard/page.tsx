import type { Metadata } from "next";
import Link from "next/link";

import { openConversationForBooking } from "@/app/actions/messaging";
import { SamplePreviewBanner } from "@/components/sample-preview-banner";
import { DeadlineCountdown } from "@/components/deadline-countdown";
import { StatusPill } from "@/components/status-pill";
import { Button, buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { RealtimeRefresh } from "@/components/realtime-refresh";
import { requireRole } from "@/lib/auth/session";
import { releaseExpiredAcceptances } from "@/lib/booking/requests";
import { demoBookings, getDemoPreview } from "@/lib/demo/sample-preview";
import type { BookingFlow, BookingStatus } from "@/lib/db/types";
import {
  getCustomerConversationIndex,
  type ConversationEntry,
} from "@/lib/messaging/summaries";
import { createClient } from "@/lib/supabase/server";
import { cn, formatDateTime, formatMoney } from "@/lib/utils";

import { CancelBookingButton } from "./cancel-booking-button";
import { ReviewForm } from "./review-form";
import { DismissDeclinedBookingButton } from "./dismiss-declined-booking-button";

export const metadata: Metadata = { title: "My bookings" };

const UPCOMING: BookingStatus[] = [
  "requested",
  "accepted",
  "paid",
  "booked",
  "in_progress",
  "invoice_review",
  "disputed",
];

type BookingRow = {
  id: string;
  booking_flow: BookingFlow;
  status: BookingStatus;
  scheduled_at: string;
  address: string;
  price_cents: number;
  estimated_minutes: number | null;
  hourly_rate_cents_snapshot: number | null;
  response_alert_at: string | null;
  initial_payment_due_at: string | null;
  dismissed_at: string | null;
  cancelled_by_role: string | null;
  service: { name: string; slug: string };
  provider: { display_name: string };
  review: { id: string } | null;
  invoice: {
    status: string;
    remaining_balance_cents: number;
    resolved_at: string | null;
  } | null;
  dispute: { id: string; status: string } | null;
  responseAlertReached?: boolean;
};

type BookingGroups = {
  attention: BookingRow[];
  upcoming: BookingRow[];
  past: BookingRow[];
};

/**
 * Split bookings three ways. A provider-declined request whose date is still in
 * the future is pulled into "Needs attention" so it stays visible on the
 * default (Upcoming) view instead of silently dropping into Past — otherwise a
 * decline just looks like the request vanished. Once its date passes it falls
 * into Past like any other closed booking.
 */
function partitionBookings(bookings: BookingRow[], now: Date): BookingGroups {
  const attention: BookingRow[] = [];
  const upcoming: BookingRow[] = [];
  const past: BookingRow[] = [];
  for (const source of bookings) {
    const responseAlertReached = Boolean(
      source.booking_flow === "hourly_v1" &&
        source.status === "requested" &&
        source.response_alert_at &&
        new Date(source.response_alert_at) <= now &&
        new Date(source.scheduled_at) > now,
    );
    const booking: BookingRow =
      source.booking_flow === "hourly_v1" &&
      source.status === "requested" &&
      new Date(source.scheduled_at) <= now
        ? { ...source, status: "expired", responseAlertReached: false }
        : { ...source, responseAlertReached };
    if (booking.status === "declined" && booking.dismissed_at) continue;
    const providerCancelledUpcoming =
      booking.status === "cancelled" &&
      booking.cancelled_by_role === "provider" &&
      new Date(booking.scheduled_at) >= now;
    if (
      booking.status === "declined" &&
      new Date(booking.scheduled_at) >= now
    ) {
      attention.push(booking);
    } else if (providerCancelledUpcoming) {
      attention.push(booking);
    } else if (responseAlertReached) {
      attention.push(booking);
    } else if (UPCOMING.includes(booking.status)) {
      upcoming.push(booking);
    } else {
      past.push(booking);
    }
  }
  return { attention, upcoming, past };
}

export default async function CustomerDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{
    tab?: string;
    requested?: string;
    replaced?: string;
    paid?: string;
  }>;
}) {
  const [{ tab, requested, replaced, paid }, session] = await Promise.all([
    searchParams,
    requireRole("customer", "/dashboard"),
  ]);
  const showPast = tab === "past";
  const now = new Date();
  const demoPreview = await getDemoPreview("customer");

  if (demoPreview) {
    // The demo path never resolves a real conversation, so it passes an empty
    // index and the sample rows' shape difference is safe here.
    const groups = partitionBookings(
      demoBookings as unknown as BookingRow[],
      now,
    );
    return (
      <CustomerDashboardView
        groups={groups}
        showPast={showPast}
        requested={requested}
        replaced={replaced}
        paid={paid}
        convoIndex={new Map()}
        demo
      />
    );
  }

  const supabase = await createClient();
  const { data } = await supabase
    .from("bookings")
    .select(
      `id, booking_flow, status, scheduled_at, address, price_cents,
       estimated_minutes, hourly_rate_cents_snapshot, response_alert_at,
       initial_payment_due_at, dismissed_at, cancelled_by_role,
       service:services(name, slug),
       provider:provider_profiles(display_name), review:reviews(id),
       invoice:booking_invoices(status, remaining_balance_cents, resolved_at),
       dispute:booking_disputes(id, status)`,
    )
    .eq("customer_id", session.user.id)
    .order("scheduled_at", { ascending: showPast ? false : true });

  const rows = (data ?? []) as BookingRow[];
  // Release any acceptance whose first-hour payment window has closed, then
  // reflect the new status before partitioning (Phase 7 schedules this too).
  const expiredIds = await releaseExpiredAcceptances(supabase, rows);
  const groups = partitionBookings(
    rows.map((row) =>
      expiredIds.has(row.id) ? { ...row, status: "expired" } : row,
    ),
    now,
  );
  const convoIndex = await getCustomerConversationIndex(
    supabase,
    session.user.id,
  );

  return (
    <CustomerDashboardView
      groups={groups}
      showPast={showPast}
      requested={requested}
      replaced={replaced}
      paid={paid}
      convoIndex={convoIndex}
      customerId={session.user.id}
    />
  );
}

function CustomerDashboardView({
  groups,
  showPast,
  requested,
  replaced,
  paid,
  convoIndex,
  customerId,
  demo = false,
}: {
  groups: BookingGroups;
  showPast: boolean;
  requested?: string;
  replaced?: string;
  paid?: string;
  convoIndex: Map<string, ConversationEntry>;
  customerId?: string;
  demo?: boolean;
}) {
  const { attention, upcoming, past } = groups;
  const list = showPast ? past : upcoming;
  const showAttention = !showPast && attention.length > 0;

  const tabClass = (active: boolean) =>
    cn(
      "rounded-lg px-4 py-2 text-sm font-semibold transition-colors",
      active ? "bg-crew-600 text-white" : "text-ink-soft hover:bg-crew-50",
    );

  return (
    <div className="space-y-6">
      {demo ? null : (
        <RealtimeRefresh
          channel={`customer-bookings:${customerId}`}
          table="bookings"
          filter={`customer_id=eq.${customerId}`}
        />
      )}
      <PageHeader
        title="My bookings"
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
            : "Request sent. The provider will accept or decline — once they accept, you'll confirm and pay here."}
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
            : "Booking confirmed — you're on the schedule."}
        </div>
      ) : null}

      <div
        role="tablist"
        aria-label="Booking filters"
        className="inline-flex gap-1 rounded-xl border border-line bg-court p-1"
      >
        <Link role="tab" aria-selected={!showPast} href="/dashboard" className={tabClass(!showPast)}>
          Upcoming
        </Link>
        <Link
          role="tab"
          aria-selected={showPast}
          href="/dashboard?tab=past"
          className={tabClass(showPast)}
        >
          Past
        </Link>
      </div>

      {showAttention ? (
        <section aria-label="Needs attention" className="space-y-3">
          <h2 className="flex items-center gap-2 font-display text-sm font-semibold text-red-800">
            <span aria-hidden>⚠</span> Needs attention
          </h2>
          <ul className="space-y-4">
            {attention.map((booking) => (
              <li key={booking.id}>
                <BookingCard
                  booking={booking}
                  demo={demo}
                  convo={demo ? undefined : convoIndex.get(booking.id)}
                  attention
                />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {list.length > 0 ? (
        <ul className="space-y-4">
          {list.map((booking) => (
            <li key={booking.id}>
              <BookingCard
                booking={booking}
                demo={demo}
                convo={demo ? undefined : convoIndex.get(booking.id)}
              />
            </li>
          ))}
        </ul>
      ) : showPast || !showAttention ? (
        <EmptyState
          title={showPast ? "No past bookings" : "Nothing booked yet"}
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
            : "Find a verified student and send your first request."}
        </EmptyState>
      ) : null}
    </div>
  );
}

/**
 * One booking card, shared by the attention, upcoming, and past lists. A
 * declined booking gets a red alert with the provider's message preview, a
 * "Read message" button into the chat, and a re-book CTA — so a decline reads
 * as "here's what happened and what to do next," not a dead end. Any booking
 * with an existing conversation keeps a "Message" button, past ones included.
 */
function BookingCard({
  booking,
  demo,
  convo,
  attention = false,
}: {
  booking: BookingRow;
  demo: boolean;
  convo?: ConversationEntry;
  attention?: boolean;
}) {
  const providerName = booking.provider.display_name;
  const isDeclined = booking.status === "declined";
  const isProviderCancelled =
    booking.status === "cancelled" &&
    booking.cancelled_by_role === "provider";
  const isUpcoming = (UPCOMING as string[]).includes(booking.status);
  const isHourly = booking.booking_flow === "hourly_v1";
  const responseAlertReached = booking.responseAlertReached === true;
  const note = convo?.latest?.fromOther ? convo.latest : null;
  const hasProviderMessage = Boolean(note);

  // Cancellation + dispute eligibility (Phase 6). The RPCs re-check everything
  // atomically; this only drives what the card offers and the outcome preview.
  const nowMs = new Date().getTime();
  const startMs = new Date(booking.scheduled_at).getTime();
  const startPassed = startMs <= nowMs;
  const legacyCancel =
    !isHourly &&
    (booking.status === "requested" || booking.status === "accepted");
  const hourlyCancel =
    isHourly &&
    !demo &&
    (booking.status === "requested" ||
      booking.status === "accepted" ||
      (booking.status === "booked" && !startPassed));
  const cancelOutcome: "full_refund" | "no_refund" | "no_payment" | undefined =
    booking.status === "booked"
      ? startMs - nowMs >= 12 * 3_600_000
        ? "full_refund"
        : "no_refund"
      : booking.status === "requested" || booking.status === "accepted"
        ? "no_payment"
        : undefined;
  const cancelLabel =
    booking.status === "booked" ? "Cancel booking" : "Cancel request";

  const hasOpenDispute = booking.dispute?.status === "open";
  const finalChargeAt = booking.invoice?.resolved_at
    ? new Date(booking.invoice.resolved_at).getTime()
    : null;
  const withinLateWindow =
    finalChargeAt != null && nowMs <= finalChargeAt + 7 * 24 * 3_600_000;
  const noShowEligible =
    isHourly && booking.status === "booked" && startPassed;
  const disputeEligible =
    isHourly &&
    !demo &&
    !hasOpenDispute &&
    (noShowEligible ||
      booking.status === "in_progress" ||
      booking.status === "invoice_review" ||
      (booking.status === "completed" && withinLateWindow));

  return (
    <Card
      data-booking-id={booking.id}
      data-declined-booking={isDeclined || undefined}
      className={cn(
        "p-5 transition-[opacity,transform] duration-200 ease-out",
        attention && "border-red-200",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-display text-lg font-semibold">
            {booking.service.name}
          </p>
          <p className="mt-0.5 text-sm text-ink-soft">
            with {providerName} · {formatDateTime(booking.scheduled_at)}
          </p>
          <p className="mt-0.5 text-xs text-mist">
            {booking.address} ·{" "}
            {isHourly && booking.hourly_rate_cents_snapshot != null
              ? `${formatMoney(booking.hourly_rate_cents_snapshot)}/hr · ${booking.estimated_minutes ?? 60} min estimate`
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
              “{note.body}” — {providerName}
            </p>
          ) : (
            <p className="mt-1 text-red-700">
              Message them for details, or find another provider below.
            </p>
          )}
        </div>
      ) : null}

      {isProviderCancelled ? (
        <div
          role="alert"
          className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800"
        >
          <p className="font-semibold">{providerName} cancelled this booking.</p>
          <p className="mt-1 text-red-700">
            You&apos;ve been fully refunded. Find another verified student for
            the same job below.
          </p>
        </div>
      ) : null}

      {responseAlertReached ? (
        <div
          role="status"
          className="mt-4 rounded-lg border border-gold-300 bg-gold-100 p-4 text-sm text-gold-800"
        >
          <p className="font-semibold">The response deadline has passed.</p>
          <p className="mt-1">
            Your original request is still open. You can keep waiting, cancel,
            or atomically send one replacement request.
          </p>
        </div>
      ) : null}

      {isHourly && booking.status === "requested" && booking.response_alert_at ? (
        <div className="mt-3">
          <DeadlineCountdown
            target={booking.response_alert_at}
            label="Response alert"
          />
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
          <p className="font-semibold">Your balance payment needs attention.</p>
          <p className="mt-1">
            The final charge didn&apos;t go through — review the invoice and
            update your payment method.
          </p>
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {booking.status === "accepted" && !isHourly ? (
          <Link
            href={demo ? "/bookings/demo/confirm" : `/bookings/${booking.id}/confirm`}
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
              : "Review & pay"}
          </Link>
        ) : null}

        {responseAlertReached && !demo ? (
          <Link
            href={`/bookings/${booking.id}/replace`}
            className={buttonClasses({ size: "sm" })}
          >
            Find replacement
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
        ) : !demo && (isDeclined || isUpcoming) ? (
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

        {isDeclined && !demo ? (
          <DismissDeclinedBookingButton bookingId={booking.id} />
        ) : null}

        {isDeclined ? (
          <Link
            href={demo ? "/book/demo" : "/browse"}
            className={buttonClasses({ variant: "secondary", size: "sm" })}
          >
            Find another provider
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

        {isProviderCancelled && !demo ? (
          <Link
            href="/browse"
            className={buttonClasses({ size: "sm" })}
          >
            Find a replacement
          </Link>
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
            {noShowEligible ? "Report a no-show" : "Report a problem"}
          </Link>
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
            <ReviewForm bookingId={booking.id} />
          )}
        </div>
      ) : null}
    </Card>
  );
}
