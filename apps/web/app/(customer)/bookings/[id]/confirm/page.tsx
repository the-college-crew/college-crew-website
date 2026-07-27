import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { BookingCopyProvider } from "@/components/content/booking-copy-provider";
import { DeadlineCountdown } from "@/components/deadline-countdown";
import { StatusPill } from "@/components/status-pill";
import { buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth/session";
import {
  BASIS_POINTS_SCALE,
  BILLING_INCREMENT_MINUTES,
  calculateInvoiceAllocation,
  CUSTOMER_REFUND_NOTICE_HOURS,
  INVOICE_REVIEW_HOURS,
  PLATFORM_FEE_BPS,
} from "@/lib/booking/policy";
import {
  bookingCopyValue,
  type BookingCopyOverrides,
} from "@/lib/content/booking-copy";
import { getBookingCopyOverrides } from "@/lib/content/booking-copy.server";
import type { Booking } from "@/lib/db/types";
import {
  BOOKING_CONSENT_LABEL,
  BOOKING_FIXED_SCAFFOLD,
  GENERAL_FAMILY_DISCLOSURE,
  getBookingAddendumSnapshot,
  getBookingRiskSnapshot,
  QUOTE_PAYMENT_CONSENT_LABEL,
  QUOTE_PAYMENT_TERMS,
} from "@/lib/legal/waivers";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime, formatMoney } from "@/lib/utils";

import {
  ConfirmPayPanel,
  DeclineQuoteOffer,
} from "./confirm-pay-panel";
import { HourlyPayPanel } from "./hourly-pay-panel";

export const metadata: Metadata = { title: "Confirm & pay" };

const platformFeePercent =
  (PLATFORM_FEE_BPS / BASIS_POINTS_SCALE) * 100;

type ConfirmBooking = Booking & {
  service: { name: string; slug: string } | { name: string; slug: string }[] | null;
  provider: { display_name: string } | { display_name: string }[] | null;
  customer: { full_name: string | null } | { full_name: string | null }[] | null;
};

function first<T>(value: T | T[] | null): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

/**
 * Confirm & pay (SPEC §8, text-only screen): reached from the dashboard once
 * the provider accepts. Legacy bookings take one full-price charge; hourly
 * bookings take the first-hour payment plus saved-method authorization. Either
 * way, the booking only advances from the webhook, never from the client.
 */
export default async function ConfirmPayPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ redirect_status?: string }>;
}) {
  const [
    { id },
    { redirect_status: redirectStatus },
    copyOverrides,
  ] = await Promise.all([
    params,
    searchParams,
    getBookingCopyOverrides("customer"),
  ]);
  const copy = (
    key: Parameters<typeof bookingCopyValue>[1],
    values?: Record<string, string | number>,
  ) => bookingCopyValue(copyOverrides, key, values);
  const user = await requireUser(`/bookings/${id}/confirm`);

  const supabase = await createClient();
  const { data } = await supabase
    .from("bookings")
    .select(
      `*, service:services(name, slug),
       provider:provider_profiles(display_name),
       customer:profiles!bookings_customer_id_fkey(full_name)`,
    )
    .eq("id", id)
    .maybeSingle();

  const booking = data as ConfirmBooking | null;
  if (!booking || booking.customer_id !== user.id) notFound();

  const service = first(booking.service);
  const provider = first(booking.provider);
  const customer = first(booking.customer);
  if (!service || !provider) notFound();

  const paidSucceeded = redirectStatus === "succeeded";

  if (booking.booking_flow === "hourly_v1") {
    return (
      <BookingCopyProvider overrides={copyOverrides}>
        <HourlyConfirmView
          booking={booking}
          serviceName={service.name}
          serviceSlug={service.slug}
          providerName={provider.display_name}
          customerName={customer?.full_name ?? "Customer"}
          paidSucceeded={paidSucceeded}
          copyOverrides={copyOverrides}
        />
      </BookingCopyProvider>
    );
  }

  // ---- Full-price flow: legacy fixed bookings and finalized quotes ------
  const isQuote = ["quote_v1", "quote_v2"].includes(booking.booking_flow);
  const isDepositQuote = booking.booking_flow === "quote_v2";
  const scheduledLabel = booking.scheduled_at
    ? formatDateTime(booking.scheduled_at)
    : booking.requested_local_date && booking.requested_daypart
      ? `${booking.requested_local_date} · ${booking.requested_daypart}`
      : "Exact time pending";
  const depositCents = booking.upfront_payment_cents ?? 0;
  const remainingQuoteCents = Math.max(0, booking.price_cents - depositCents);
  const rows = [
    { label: "Service", value: service.name },
    { label: "Provider", value: provider.display_name },
    { label: "When", value: scheduledLabel },
    { label: "Where", value: booking.address },
    {
      label: isQuote ? "Final flat quote" : "Price",
      value: formatMoney(booking.price_cents),
    },
    ...(isDepositQuote
      ? [
          { label: "20% deposit due now", value: formatMoney(depositCents) },
          {
            label: "Remaining after the job",
            value: formatMoney(remainingQuoteCents),
          },
        ]
      : []),
  ];
  const addendum = booking.scheduled_at
    ? getBookingRiskSnapshot({
        serviceSlug: service.slug,
        serviceName: service.name,
        scheduledAt: formatDateTime(booking.scheduled_at),
        address: booking.address,
        providerName: provider.display_name,
        customerName: customer?.full_name ?? "Customer",
      })
    : null;

  return (
    <BookingCopyProvider overrides={copyOverrides}>
      <div className="mx-auto max-w-xl space-y-6">
      <PageHeader
        title={copy("booking-customer.confirm.full-price-title")}
        description={
          isQuote
            ? copy("booking-customer.confirm.quote-description")
            : copy("booking-customer.confirm.fixed-description")
        }
      />

      <Card pennant className="p-6">
        <div className="flex justify-end">
          <StatusPill status={booking.status} />
        </div>
        <dl className="mt-2 divide-y divide-line text-sm">
          {rows.map((row) => (
            <div key={row.label} className="flex justify-between gap-4 py-3">
              <dt className="text-mist">{row.label}</dt>
              <dd className="text-right font-medium">{row.value}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-2 text-xs text-mist">
          {copy("booking-customer.confirm.full-price-fee-note")}
        </p>

        {isQuote ? (
          <section className="mt-4 rounded-xl border border-gold-300 bg-gold-100 p-4 text-sm leading-6 text-gold-900">
            <h2 className="font-display text-base font-semibold">
              Flat quote terms
            </h2>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {(isDepositQuote
                ? [
                    "The final quote is fixed and cannot change at completion.",
                    "College Crew charges 20% now and holds it until settlement.",
                    "The remaining 80% is invoiced after the job and may be paid by card or in person.",
                    "Invoice review, disputes, payment recovery, and provider payout follow the hourly booking process.",
                  ]
                : QUOTE_PAYMENT_TERMS
              ).map((term) => (
                <li key={term}>{term}</li>
              ))}
            </ul>
          </section>
        ) : null}

        {booking.status === "accepted" ? (
          <div className="mt-6 rounded-xl border border-line bg-court p-4 text-sm leading-6 text-ink-soft">
            <h2 className="font-display text-lg font-semibold text-ink">
              Booking Risk Addendum
            </h2>
            <div className="mt-3 space-y-3">
              {BOOKING_FIXED_SCAFFOLD.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </div>

            <dl className="mt-4 divide-y divide-line rounded-lg border border-line bg-paper px-3">
              {rows.slice(0, 4).map((row) => (
                <div key={row.label} className="flex justify-between gap-4 py-2">
                  <dt className="text-mist">{row.label}</dt>
                  <dd className="text-right font-medium text-ink">
                    {row.value}
                  </dd>
                </div>
              ))}
            </dl>

            {addendum ? (
              <>
                <section className="mt-5 border-t border-line pt-4">
                  <h3 className="font-display text-base font-semibold text-ink">
                    {addendum.serviceRisk.title}
                  </h3>
                  <div className="mt-2 space-y-3">
                    {addendum.serviceRisk.body.map((paragraph) => (
                      <p key={paragraph}>{paragraph}</p>
                    ))}
                  </div>
                </section>
                <section className="mt-5 border-t border-line pt-4">
                  <h3 className="font-display text-base font-semibold text-ink">
                    General Family Disclosure Requirement
                  </h3>
                  <div className="mt-2 space-y-3">
                    {GENERAL_FAMILY_DISCLOSURE.map((paragraph) => (
                      <p key={paragraph}>{paragraph}</p>
                    ))}
                  </div>
                </section>
              </>
            ) : (
              <p className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-700">
                This service does not have a booking risk addendum yet. Contact
                College Crew before confirming.
              </p>
            )}
          </div>
        ) : null}

        <div className="mt-6">
          {booking.status === "accepted" && paidSucceeded ? (
            <div className="rounded-lg border border-quad-200 bg-quad-50 p-4 text-sm text-quad-800">
              Payment received. Finalizing your booking. Refresh in a moment.
            </div>
          ) : booking.status === "accepted" && addendum ? (
            <div className="space-y-3">
              {isDepositQuote ? (
                <DeadlineCountdown
                  target={
                    booking.initial_payment_due_at ??
                    booking.scheduled_at ??
                    new Date().toISOString()
                  }
                  label="20% deposit due"
                />
              ) : null}
              <ConfirmPayPanel
                bookingId={booking.id}
                simulateAllowed={process.env.NODE_ENV !== "production"}
                requiresAuthorization={isDepositQuote}
                consentLabel={
                  isQuote ? QUOTE_PAYMENT_CONSENT_LABEL : undefined
                }
              />
              {isDepositQuote ? (
                <DeclineQuoteOffer bookingId={booking.id} />
              ) : null}
            </div>
          ) : booking.status === "accepted" ? (
            <div className="rounded-lg border border-line bg-court p-4 text-sm text-ink-soft">
              This booking needs a service-specific risk addendum before payment
              can continue.
            </div>
          ) : ["paid", "booked", "in_progress", "invoice_review", "completed"].includes(
              booking.status,
            ) ? (
            <div className="rounded-lg border border-quad-200 bg-quad-50 p-4 text-sm text-quad-800">
              {isDepositQuote
                ? "Deposit paid and booking confirmed; the remaining balance is due after the job."
                : "This booking is confirmed and paid. You're all set."}
            </div>
          ) : booking.status === "requested" ? (
            <div className="rounded-lg border border-line bg-court p-4 text-sm text-ink-soft">
              {isQuote
                ? copy("booking-customer.confirm.quote-waiting")
                : copy("booking-customer.confirm.provider-waiting")}
            </div>
          ) : (
            <div className="rounded-lg border border-line bg-court p-4 text-sm text-ink-soft">
              This booking is no longer active.
            </div>
          )}
        </div>
      </Card>

      <BackToDashboard />
      </div>
    </BookingCopyProvider>
  );
}

/** Hourly first-hour payment surface. */
function HourlyConfirmView({
  booking,
  serviceName,
  serviceSlug,
  providerName,
  customerName,
  paidSucceeded,
  copyOverrides,
}: {
  booking: ConfirmBooking;
  serviceName: string;
  serviceSlug: string;
  providerName: string;
  customerName: string;
  paidSucceeded: boolean;
  copyOverrides: BookingCopyOverrides;
}) {
  if (!booking.scheduled_at) notFound();
  const copy = (
    key: Parameters<typeof bookingCopyValue>[1],
    values?: Record<string, string | number>,
  ) => bookingCopyValue(copyOverrides, key, values);
  const rateCents = booking.hourly_rate_cents_snapshot ?? 0;
  const estimatedMinutes = booking.estimated_minutes ?? 60;
  const allocation = calculateInvoiceAllocation(rateCents, estimatedMinutes);
  const firstHourLabel = formatMoney(allocation.firstHourCents);
  const estimatedTotalLabel = formatMoney(allocation.subtotalCents);
  const balanceLabel = formatMoney(allocation.remainingBalanceCents);
  const hours = Math.round((estimatedMinutes / 60) * 10) / 10;

  const bookingRows = [
    { label: "Service", value: serviceName },
    { label: "Provider", value: providerName },
    { label: "When", value: formatDateTime(booking.scheduled_at) },
    { label: "Where", value: booking.address },
  ];
  const paymentRows = [
    {
      label: copy("booking-customer.confirm.rate-label"),
      value: `${formatMoney(rateCents)}/hr`,
    },
    {
      label: copy("booking-customer.confirm.estimate-label"),
      value: `${estimatedMinutes} min (~${hours} hr)`,
    },
    {
      label: copy("booking-customer.confirm.first-hour-label"),
      value: firstHourLabel,
    },
    {
      label: copy("booking-customer.confirm.total-label"),
      value: estimatedTotalLabel,
    },
  ];

  const addendum = getBookingAddendumSnapshot({
    serviceSlug,
    serviceName,
    scheduledAt: formatDateTime(booking.scheduled_at),
    address: booking.address,
    providerName,
    customerName,
  });

  const dueAt = booking.initial_payment_due_at;
  const windowClosed = Boolean(dueAt && new Date(dueAt) <= new Date());
  const isAccepted = booking.status === "accepted";

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <PageHeader
        title={copy("booking-customer.confirm.title")}
        description={copy("booking-customer.confirm.description")}
      />

      <Card pennant className="p-6">
        <div className="flex justify-end">
          <StatusPill status={booking.status} />
        </div>
        <dl className="mt-2 divide-y divide-line text-sm">
          {bookingRows.map((row) => (
            <div key={row.label} className="flex justify-between gap-4 py-3">
              <dt className="text-mist">{row.label}</dt>
              <dd className="text-right font-medium">{row.value}</dd>
            </div>
          ))}
        </dl>
        <h2 className="mt-4 font-display text-xs font-semibold uppercase tracking-wide text-mist">
          {copy("booking-customer.confirm.payment-heading")}
        </h2>
        <dl className="divide-y divide-line text-sm">
          {paymentRows.map((row) => (
            <div key={row.label} className="flex justify-between gap-4 py-3">
              <dt className="text-mist">{row.label}</dt>
              <dd className="text-right font-medium">{row.value}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-3 rounded-lg border border-line bg-court p-4 text-xs leading-5 text-ink-soft">
          <p>
            {copy("booking-customer.confirm.payment-explanation", {
              first_hour_amount: firstHourLabel,
            })}
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-4">
            <li>
              Final time is the actual work rounded up to{" "}
              {BILLING_INCREMENT_MINUTES} minutes (one-hour minimum); time
              beyond the estimate needs an explanation.
            </li>
            <li>
              {copy("booking-customer.confirm.invoice-policy", {
                invoice_hours: INVOICE_REVIEW_HOURS,
              })}
            </li>
            <li>
              {copy("booking-customer.confirm.cancellation-policy", {
                cancellation_hours: CUSTOMER_REFUND_NOTICE_HOURS,
              })}
            </li>
            <li>
              College Crew&apos;s {platformFeePercent}% fee comes out of the
              provider&apos;s earnings.
            </li>
          </ul>
        </div>

        {isAccepted && addendum ? (
          <section className="mt-5 rounded-xl border border-line bg-court p-4 text-sm leading-6 text-ink-soft">
            <h2 className="font-display text-lg font-semibold text-ink">
              Booking Risk Addendum
            </h2>
            <div className="mt-3 space-y-3">
              {BOOKING_FIXED_SCAFFOLD.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </div>
            <div className="mt-4 border-t border-line pt-4">
              <h3 className="font-display text-base font-semibold text-ink">
                {addendum.serviceRisk.title}
              </h3>
              <div className="mt-2 space-y-3">
                {addendum.serviceRisk.body.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </div>
            </div>
            <div className="mt-4 border-t border-line pt-4">
              <h3 className="font-display text-base font-semibold text-ink">
                General Family Disclosure Requirement
              </h3>
              <div className="mt-2 space-y-3">
                {GENERAL_FAMILY_DISCLOSURE.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </div>
            </div>
          </section>
        ) : null}

        <div className="mt-6">
          {isAccepted && paidSucceeded ? (
            <div className="rounded-lg border border-quad-200 bg-quad-50 p-4 text-sm text-quad-800">
              {copy("booking-customer.confirm.payment-received")}
            </div>
          ) : isAccepted && windowClosed ? (
            <div className="rounded-lg border border-gold-300 bg-gold-100 p-4 text-sm text-gold-800">
              <p className="font-semibold">
                {copy("booking-customer.confirm.window-closed-title")}
              </p>
              <p className="mt-1">
                {copy("booking-customer.confirm.window-closed-body")}
              </p>
              <Link
                href="/browse"
                className={buttonClasses({ size: "sm", variant: "secondary" }) + " mt-3"}
              >
                Find a provider
              </Link>
            </div>
          ) : isAccepted && addendum ? (
            <div className="space-y-3">
              <DeadlineCountdown
                target={dueAt ?? booking.scheduled_at}
                label="First-hour payment due"
              />
              <HourlyPayPanel
                bookingId={booking.id}
                firstHourLabel={firstHourLabel}
                estimatedTotalLabel={estimatedTotalLabel}
                balanceLabel={balanceLabel}
                consentLabel={BOOKING_CONSENT_LABEL}
              />
            </div>
          ) : isAccepted ? (
            <div className="rounded-lg border border-line bg-court p-4 text-sm text-ink-soft">
              This booking needs a service-specific risk addendum before payment
              can continue.
            </div>
          ) : booking.status === "booked" ? (
            <div className="rounded-lg border border-quad-200 bg-quad-50 p-4 text-sm text-quad-800">
              {copy("booking-customer.confirm.booked")}
            </div>
          ) : booking.status === "invoice_review" ? (
            <div className="space-y-3 rounded-lg border border-quad-200 bg-quad-50 p-4 text-sm text-quad-800">
              <p>{copy("booking-customer.confirm.invoice-ready")}</p>
              <Link
                href={`/bookings/${booking.id}/invoice`}
                className={buttonClasses({ size: "sm" })}
              >
                {copy("booking-customer.confirm.invoice-button")}
              </Link>
            </div>
          ) : ["in_progress", "disputed"].includes(booking.status) ? (
            <div className="rounded-lg border border-quad-200 bg-quad-50 p-4 text-sm text-quad-800">
              {copy("booking-customer.confirm.underway")}
            </div>
          ) : booking.status === "requested" ? (
            <div className="rounded-lg border border-line bg-court p-4 text-sm text-ink-soft">
              Still waiting on the provider. You&apos;ll pay the first hour once
              they accept.
            </div>
          ) : (
            <div className="rounded-lg border border-line bg-court p-4 text-sm text-ink-soft">
              This booking is no longer active.
            </div>
          )}
        </div>
      </Card>

      <BackToDashboard />
    </div>
  );
}

function BackToDashboard() {
  return (
    <p className="text-center">
      <Link
        href="/dashboard"
        className={buttonClasses({ variant: "ghost", size: "sm" })}
      >
        ← Back to dashboard
      </Link>
    </p>
  );
}
