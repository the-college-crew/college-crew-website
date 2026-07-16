import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { DeadlineCountdown } from "@/components/deadline-countdown";
import { StatusPill } from "@/components/status-pill";
import { buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth/session";
import { calculateInvoiceAllocation } from "@/lib/booking/policy";
import type { Booking } from "@/lib/db/types";
import {
  BOOKING_CONSENT_LABEL,
  BOOKING_FIXED_SCAFFOLD,
  GENERAL_FAMILY_DISCLOSURE,
  getBookingAddendumSnapshot,
  getBookingRiskSnapshot,
} from "@/lib/legal/waivers";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime, formatMoney } from "@/lib/utils";

import { ConfirmPayPanel } from "./confirm-pay-panel";
import { HourlyPayPanel } from "./hourly-pay-panel";

export const metadata: Metadata = { title: "Confirm & pay" };

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
  const [{ id }, { redirect_status: redirectStatus }] = await Promise.all([
    params,
    searchParams,
  ]);
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
      <HourlyConfirmView
        booking={booking}
        serviceName={service.name}
        serviceSlug={service.slug}
        providerName={provider.display_name}
        customerName={customer?.full_name ?? "Customer"}
        paidSucceeded={paidSucceeded}
      />
    );
  }

  // ---- Legacy full-price flow -------------------------------------------
  const rows = [
    { label: "Service", value: service.name },
    { label: "Provider", value: provider.display_name },
    { label: "When", value: formatDateTime(booking.scheduled_at) },
    { label: "Where", value: booking.address },
    { label: "Price", value: formatMoney(booking.price_cents) },
  ];
  const addendum = getBookingRiskSnapshot({
    serviceSlug: service.slug,
    serviceName: service.name,
    scheduledAt: formatDateTime(booking.scheduled_at),
    address: booking.address,
    providerName: provider.display_name,
    customerName: customer?.full_name ?? "Customer",
  });

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <PageHeader
        title="Confirm & pay"
        description="The provider accepted your request. Confirm the details below to lock it in."
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
          You pay the price shown; College Crew&apos;s platform fee comes out of
          the provider&apos;s earnings.
        </p>

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
            <ConfirmPayPanel
              bookingId={booking.id}
              simulateAllowed={process.env.NODE_ENV !== "production"}
            />
          ) : booking.status === "accepted" ? (
            <div className="rounded-lg border border-line bg-court p-4 text-sm text-ink-soft">
              This booking needs a service-specific risk addendum before payment
              can continue.
            </div>
          ) : booking.status === "paid" || booking.status === "completed" ? (
            <div className="rounded-lg border border-quad-200 bg-quad-50 p-4 text-sm text-quad-800">
              This booking is confirmed and paid. You&apos;re all set.
            </div>
          ) : booking.status === "requested" ? (
            <div className="rounded-lg border border-line bg-court p-4 text-sm text-ink-soft">
              Still waiting on the provider. You&apos;ll be able to confirm and
              pay once they accept.
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

/** Hourly first-hour payment surface. */
function HourlyConfirmView({
  booking,
  serviceName,
  serviceSlug,
  providerName,
  customerName,
  paidSucceeded,
}: {
  booking: ConfirmBooking;
  serviceName: string;
  serviceSlug: string;
  providerName: string;
  customerName: string;
  paidSucceeded: boolean;
}) {
  const rateCents = booking.hourly_rate_cents_snapshot ?? 0;
  const estimatedMinutes = booking.estimated_minutes ?? 60;
  const allocation = calculateInvoiceAllocation(rateCents, estimatedMinutes);
  const firstHourLabel = formatMoney(allocation.firstHourCents);
  const estimatedTotalLabel = formatMoney(allocation.subtotalCents);
  const balanceLabel = formatMoney(allocation.remainingBalanceCents);
  const hours = Math.round((estimatedMinutes / 60) * 10) / 10;

  const rows = [
    { label: "Service", value: serviceName },
    { label: "Provider", value: providerName },
    { label: "When", value: formatDateTime(booking.scheduled_at) },
    { label: "Where", value: booking.address },
    { label: "Rate", value: `${formatMoney(rateCents)}/hr` },
    { label: "Estimated time", value: `${estimatedMinutes} min (~${hours} hr)` },
    { label: "First-hour payment now", value: firstHourLabel },
    { label: "Estimated total", value: estimatedTotalLabel },
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
        title="Confirm & pay the first hour"
        description="Your provider accepted. Pay the first hour to lock in the booking; the rest is billed by actual time after the job."
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

        <div className="mt-3 rounded-lg border border-line bg-court p-4 text-xs leading-5 text-ink-soft">
          <p>
            You pay <span className="font-semibold">{firstHourLabel}</span> now
            for the first hour. Your card is saved to charge the remaining
            balance for <span className="font-semibold">this booking only</span>{" "}
            after the provider submits the actual time.
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-4">
            <li>
              Final time is the actual work rounded up to 15 minutes (one-hour
              minimum); time beyond the estimate needs an explanation.
            </li>
            <li>
              With no confirmation or dispute, the remaining balance is charged
              24 hours after the invoice is submitted.
            </li>
            <li>
              Cancel 12+ hours before the start for a full refund; a later
              cancellation keeps the first hour. Concerns after arrival are
              handled as a dispute.
            </li>
            <li>College Crew&apos;s 5% fee comes out of the provider&apos;s earnings.</li>
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
              Payment received. Finalizing your booking. Refresh in a moment.
            </div>
          ) : isAccepted && windowClosed ? (
            <div className="rounded-lg border border-gold-300 bg-gold-100 p-4 text-sm text-gold-800">
              <p className="font-semibold">The first-hour payment window closed.</p>
              <p className="mt-1">
                This request will be released. Send a new request to book this
                service.
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
              First hour paid. You&apos;re on the schedule. You&apos;ll see the
              final invoice here after the job.
            </div>
          ) : booking.status === "invoice_review" ? (
            <div className="space-y-3 rounded-lg border border-quad-200 bg-quad-50 p-4 text-sm text-quad-800">
              <p>
                The provider submitted the final invoice. Review it and pay the
                remaining balance.
              </p>
              <Link
                href={`/bookings/${booking.id}/invoice`}
                className={buttonClasses({ size: "sm" })}
              >
                Review & pay
              </Link>
            </div>
          ) : ["in_progress", "disputed"].includes(booking.status) ? (
            <div className="rounded-lg border border-quad-200 bg-quad-50 p-4 text-sm text-quad-800">
              This booking is already underway. Track it from your dashboard.
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
