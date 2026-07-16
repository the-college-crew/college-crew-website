import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { DeadlineCountdown } from "@/components/deadline-countdown";
import { StatusPill } from "@/components/status-pill";
import { buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime, formatMoney } from "@/lib/utils";

import { InvoicePayPanel, InvoiceRecoveryPanel } from "./invoice-pay-panel";

export const metadata: Metadata = { title: "Invoice" };

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
  const { id } = await params;
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
  if (booking.booking_flow !== "hourly_v1") redirect(`/bookings/${id}/confirm`);

  const { data: invoice } = await supabase
    .from("booking_invoices")
    .select(
      `id, submitted_minutes, provider_explanation, subtotal_cents,
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
      <div className="space-y-6">
        <PageHeader title="Invoice" description={service?.name ?? "Your booking"} />
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
    );
  }

  const isPaid =
    booking.status === "completed" ||
    ["paid", "waived", "refunded"].includes(invoice.status);
  const isReviewable =
    booking.status === "invoice_review" && invoice.status === "review";
  const needsRecovery = invoice.status === "requires_action";
  const isProcessing = invoice.status === "processing";
  const overEstimate =
    booking.estimated_minutes != null &&
    invoice.submitted_minutes > booking.estimated_minutes;

  const lines: Array<{ label: string; value: string; strong?: boolean }> = [
    {
      label: `${formatMinutes(invoice.submitted_minutes)} at ${formatMoney(
        booking.hourly_rate_cents_snapshot ?? 0,
      )}/hr`,
      value: formatMoney(invoice.subtotal_cents),
    },
    {
      label: "First hour already paid",
      value: `– ${formatMoney(invoice.first_hour_credit_cents)}`,
    },
    {
      label: isPaid ? "Balance paid" : "Remaining balance",
      value: formatMoney(invoice.remaining_balance_cents),
      strong: true,
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Invoice"
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
              <dt className="text-mist">Arrived</dt>
              <dd>{formatDateTime(booking.arrived_at)}</dd>
            </div>
          ) : null}
          {booking.work_completed_at ? (
            <div className="flex justify-between gap-4">
              <dt className="text-mist">Completed</dt>
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

        {overEstimate && invoice.provider_explanation ? (
          <div className="mt-4 rounded-lg border border-gold-300 bg-gold-100 p-3 text-sm text-gold-800">
            <p className="font-semibold">Time beyond the estimate</p>
            <p className="mt-1">{invoice.provider_explanation}</p>
          </div>
        ) : null}

        <p className="mt-4 border-t border-line pt-3 text-xs text-mist">
          The 5% platform fee comes out of the provider&apos;s payout — the
          amount above is all you pay.
        </p>
      </Card>

      <Card className="p-5">
        {isPaid ? (
          <div className="space-y-3 text-sm">
            <p className="font-semibold text-quad-700">Paid in full ✓</p>
            <Link
              href="/dashboard"
              className={buttonClasses({ variant: "secondary", size: "sm" })}
            >
              Leave a review
            </Link>
          </div>
        ) : isProcessing ? (
          <div className="rounded-lg border border-quad-200 bg-quad-50 p-4 text-sm text-quad-800">
            <p className="font-semibold">Payment processing.</p>
            <p className="mt-1">This updates to Completed once it settles.</p>
          </div>
        ) : needsRecovery ? (
          <InvoiceRecoveryPanel bookingId={booking.id} />
        ) : isReviewable ? (
          <div className="space-y-3">
            {invoice.autocharge_at &&
            invoice.remaining_balance_cents > 0 ? (
              <DeadlineCountdown
                target={invoice.autocharge_at}
                label="Auto-charges the saved card"
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
          </Link>{" "}
          — a founder reviews it and payment pauses while it’s open.
        </p>
      </Card>
    </div>
  );
}
