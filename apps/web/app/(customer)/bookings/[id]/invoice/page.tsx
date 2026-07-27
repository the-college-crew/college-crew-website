import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { BookingCopyProvider } from "@/components/content/booking-copy-provider";
import { DeadlineCountdown } from "@/components/deadline-countdown";
import { StatusPill } from "@/components/status-pill";
import { buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth/session";
import {
  BASIS_POINTS_SCALE,
  PLATFORM_FEE_BPS,
} from "@/lib/booking/policy";
import { bookingCopyValue } from "@/lib/content/booking-copy";
import { getBookingCopyOverrides } from "@/lib/content/booking-copy.server";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime, formatMoney } from "@/lib/utils";

import { InvoicePayPanel, InvoiceRecoveryPanel } from "./invoice-pay-panel";

export const metadata: Metadata = { title: "Invoice" };

const platformFeePercent =
  (PLATFORM_FEE_BPS / BASIS_POINTS_SCALE) * 100;

function formatMinutes(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} min`;
  if (rest === 0) return `${hours} hr`;
  return `${hours} hr ${rest} min`;
}

export default async function InvoicePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [{ id }, copyOverrides] = await Promise.all([
    params,
    getBookingCopyOverrides("customer"),
  ]);
  const copy = (
    key: Parameters<typeof bookingCopyValue>[1],
    values?: Record<string, string | number>,
  ) => bookingCopyValue(copyOverrides, key, values);
  const user = await requireUser();
  const supabase = await createClient();

  const { data: booking } = await supabase
    .from("bookings")
    .select(
      `id, customer_id, booking_flow, status, scheduled_at, address,
       arrived_at, work_completed_at, estimated_minutes,
       hourly_rate_cents_snapshot, service:services(name),
       provider:provider_profiles(display_name)`,
    )
    .eq("id", id)
    .maybeSingle();

  if (!booking || booking.customer_id !== user.id) notFound();
  if (!booking.scheduled_at) notFound();
  if (!["hourly_v1", "quote_v2"].includes(booking.booking_flow)) {
    redirect(`/bookings/${id}/confirm`);
  }
  const isQuote = booking.booking_flow === "quote_v2";

  const { data: invoice } = await supabase
    .from("booking_invoices")
    .select(
      `id, billing_basis, submitted_minutes, provider_explanation, subtotal_cents,
       total_platform_fee_cents, first_hour_credit_cents, remaining_balance_cents,
       status, submitted_at, autocharge_at, resolved_at`,
    )
    .eq("booking_id", id)
    .maybeSingle();

  const service = Array.isArray(booking.service)
    ? booking.service[0]
    : booking.service;
  const provider = Array.isArray(booking.provider)
    ? booking.provider[0]
    : booking.provider;

  if (!invoice) {
    return (
      <BookingCopyProvider overrides={copyOverrides}>
        <div className="space-y-6">
        <PageHeader
          title={copy("booking-customer.invoice.title")}
          description={service?.name ?? "Your booking"}
        />
        <Card className="p-5 text-sm text-ink-soft">
          <p>
            The provider hasn&apos;t submitted the invoice for this job yet.
            You&apos;ll be able to review and pay the balance here once they do.
          </p>
          <Link
            href="/dashboard"
            className={buttonClasses({ variant: "secondary", size: "sm" })}
            style={{ marginTop: "0.75rem" }}
          >
            Back to bookings
          </Link>
        </Card>
        </div>
      </BookingCopyProvider>
    );
  }

  const settledInCash = invoice.status === "cash_settled";
  const isPaid =
    booking.status === "completed" ||
    ["paid", "waived", "refunded", "cash_settled"].includes(invoice.status);
  const isReviewable =
    booking.status === "invoice_review" && invoice.status === "review";
  const needsRecovery = invoice.status === "requires_action";
  const isProcessing = invoice.status === "processing";
  const overEstimate =
    booking.estimated_minutes != null &&
    invoice.submitted_minutes != null &&
    invoice.submitted_minutes > booking.estimated_minutes;
  // A revised invoice: the job didn't run the length that was booked. Call the
  // difference out explicitly rather than making the customer diff two numbers.
  const estimatedMinutes = booking.estimated_minutes;
  const durationChanged =
    !isQuote &&
    estimatedMinutes != null &&
    invoice.submitted_minutes !== estimatedMinutes;
  const estimatedSubtotalCents =
    estimatedMinutes != null && booking.hourly_rate_cents_snapshot != null
      ? Math.round(
          (booking.hourly_rate_cents_snapshot * estimatedMinutes) / 60,
        )
      : null;
  const subtotalDeltaCents =
    estimatedSubtotalCents != null
      ? invoice.subtotal_cents - estimatedSubtotalCents
      : null;

  const lines: Array<{ label: string; value: string; strong?: boolean }> = [
    {
      label: isQuote
        ? "Immutable final quote"
        : `${formatMinutes(invoice.submitted_minutes ?? 0)} at ${formatMoney(
            booking.hourly_rate_cents_snapshot ?? 0,
          )}/hr`,
      value: formatMoney(invoice.subtotal_cents),
    },
    {
      label: isQuote
        ? "20% deposit already paid"
        : copy("booking-customer.invoice.first-hour-label"),
      value: `- ${formatMoney(invoice.first_hour_credit_cents)}`,
    },
    {
      label: settledInCash
        ? "Paid to your provider in person"
        : isPaid
          ? "Balance paid"
          : copy("booking-customer.invoice.balance-label"),
      value: formatMoney(invoice.remaining_balance_cents),
      strong: true,
    },
  ];

  return (
    <BookingCopyProvider overrides={copyOverrides}>
      <div className="space-y-6">
      <PageHeader
        title={copy("booking-customer.invoice.title")}
        description={`${service?.name ?? "Service"} with ${provider?.display_name ?? "your provider"}`}
      />

      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="text-sm text-ink-soft">
            <p>{formatDateTime(booking.scheduled_at)}</p>
            <p className="mt-0.5 text-xs text-mist">{booking.address}</p>
          </div>
          <StatusPill status={booking.status} />
        </div>

        <dl className="mt-4 space-y-2 border-t border-line pt-4 text-sm">
          {booking.arrived_at ? (
            <div className="flex justify-between gap-4">
              <dt className="text-mist">
                {copy("booking-customer.invoice.arrived-label")}
              </dt>
              <dd>{formatDateTime(booking.arrived_at)}</dd>
            </div>
          ) : null}
          {booking.work_completed_at ? (
            <div className="flex justify-between gap-4">
              <dt className="text-mist">
                {copy("booking-customer.invoice.completed-label")}
              </dt>
              <dd>{formatDateTime(booking.work_completed_at)}</dd>
            </div>
          ) : null}
        </dl>

        <dl className="mt-4 space-y-2 border-t border-line pt-4 text-sm">
          {lines.map((line) => (
            <div key={line.label} className="flex justify-between gap-4">
              <dt className={line.strong ? "font-semibold" : "text-mist"}>
                {line.label}
              </dt>
              <dd className={line.strong ? "font-semibold text-quad-700" : ""}>
                {line.value}
              </dd>
            </div>
          ))}
        </dl>

        {settledInCash ? (
          <div className="mt-4 rounded-lg border border-line bg-court p-3 text-sm">
            <p className="font-semibold text-ink">Settled in person</p>
            <p className="mt-1 text-xs text-ink-soft">
              Your provider recorded that you paid them directly, so we did
              not charge your card for this job. The only amount we collected is
              the {isQuote ? "deposit" : "first hour"} taken when the booking was confirmed. If that
              doesn&apos;t match what happened, report a problem below.
            </p>
          </div>
        ) : null}

        {durationChanged && estimatedMinutes != null ? (
          <div className="mt-4 rounded-lg border border-line bg-court p-3 text-sm">
            <p className="font-semibold text-ink">
              This is a revised invoice
            </p>
            <dl className="mt-2 space-y-1 text-xs text-ink-soft">
              <div className="flex justify-between gap-4">
                <dt className="text-mist">
                  {copy("booking-customer.invoice.booked-label")}
                </dt>
                <dd>
                  {formatMinutes(estimatedMinutes)}
                  {estimatedSubtotalCents != null
                    ? ` · ${formatMoney(estimatedSubtotalCents)}`
                    : ""}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-mist">
                  {copy("booking-customer.invoice.actual-label")}
                </dt>
                <dd>
                  {formatMinutes(invoice.submitted_minutes ?? 0)} ·{" "}
                  {formatMoney(invoice.subtotal_cents)}
                </dd>
              </div>
              {subtotalDeltaCents != null && subtotalDeltaCents !== 0 ? (
                <div className="flex justify-between gap-4 border-t border-line pt-1">
                  <dt className="font-semibold text-ink">
                    {copy("booking-customer.invoice.difference-label")}
                  </dt>
                  <dd
                    className={
                      subtotalDeltaCents > 0
                        ? "font-semibold text-gold-800"
                        : "font-semibold text-quad-700"
                    }
                  >
                    {subtotalDeltaCents > 0 ? "+" : "−"}
                    {formatMoney(Math.abs(subtotalDeltaCents))}
                  </dd>
                </div>
              ) : null}
            </dl>
          </div>
        ) : null}

        {overEstimate && invoice.provider_explanation ? (
          <div className="mt-4 rounded-lg border border-gold-300 bg-gold-100 p-3 text-sm text-gold-800">
            <p className="font-semibold">
              {copy("booking-customer.invoice.over-estimate")}
            </p>
            <p className="mt-1">{invoice.provider_explanation}</p>
          </div>
        ) : null}

        <p className="mt-4 border-t border-line pt-3 text-xs text-mist">
          {copy("booking-customer.invoice.fee-note", {
            platform_fee_percent: platformFeePercent,
          })}
        </p>
      </Card>

      <Card className="p-5">
        {isPaid ? (
          <div className="space-y-3 text-sm">
            <p className="font-semibold text-quad-700">
              {copy("booking-customer.invoice.paid")} ✓
            </p>
            <Link
              href="/dashboard"
              className={buttonClasses({ variant: "secondary", size: "sm" })}
            >
              Back to bookings
            </Link>
          </div>
        ) : isProcessing ? (
          <div className="rounded-lg border border-quad-200 bg-quad-50 p-4 text-sm text-quad-800">
            <p className="font-semibold">
              {copy("booking-customer.invoice.processing-title")}
            </p>
            <p className="mt-1">
              {copy("booking-customer.invoice.processing-body")}
            </p>
          </div>
        ) : needsRecovery ? (
          <InvoiceRecoveryPanel bookingId={booking.id} />
        ) : isReviewable ? (
          <div className="space-y-3">
            {invoice.autocharge_at &&
            invoice.remaining_balance_cents > 0 ? (
              <DeadlineCountdown
                target={invoice.autocharge_at}
                label={copy("booking-customer.invoice.autocharge-label")}
              />
            ) : null}
            <InvoicePayPanel
              bookingId={booking.id}
              payLabel={formatMoney(invoice.remaining_balance_cents)}
              isZeroBalance={invoice.remaining_balance_cents === 0}
            />
          </div>
        ) : (
          <p className="text-sm text-ink-soft">
            This invoice isn&apos;t awaiting payment right now.
          </p>
        )}

        <p className="mt-4 border-t border-line pt-3 text-xs text-mist">
          Something look wrong?{" "}
          <Link
            href={`/bookings/${booking.id}/dispute`}
            className="underline"
          >
            Report a problem
          </Link>. A founder reviews it and payment pauses while it’s open.
        </p>
      </Card>
      </div>
    </BookingCopyProvider>
  );
}
