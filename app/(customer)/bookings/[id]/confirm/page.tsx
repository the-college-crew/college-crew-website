import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { StatusPill } from "@/components/status-pill";
import { buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth/session";
import {
  BOOKING_FIXED_SCAFFOLD,
  GENERAL_FAMILY_DISCLOSURE,
  getBookingAddendumSnapshot,
} from "@/lib/legal/waivers";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime, formatMoney } from "@/lib/utils";

import { ConfirmPayPanel } from "./confirm-pay-panel";

export const metadata: Metadata = { title: "Confirm & pay" };

/**
 * Confirm & pay (SPEC §8, text-only screen): reached from the dashboard
 * once the provider accepts. Shows the finalized details; payment runs here.
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
  const { data: booking } = await supabase
    .from("bookings")
    .select(
      `*, service:services(name, slug),
       provider:provider_profiles(display_name),
       customer:profiles!bookings_customer_id_fkey(full_name)`,
    )
    .eq("id", id)
    .maybeSingle();

  if (!booking || booking.customer_id !== user.id) notFound();
  const service = Array.isArray(booking.service)
    ? booking.service[0]
    : booking.service;
  const provider = Array.isArray(booking.provider)
    ? booking.provider[0]
    : booking.provider;
  const customer = Array.isArray(booking.customer)
    ? booking.customer[0]
    : booking.customer;
  if (!service || !provider) notFound();

  const rows = [
    { label: "Service", value: service.name },
    { label: "Provider", value: provider.display_name },
    { label: "When", value: formatDateTime(booking.scheduled_at) },
    { label: "Where", value: booking.address },
    { label: "Price", value: formatMoney(booking.price_cents) },
  ];
  const addendum = getBookingAddendumSnapshot({
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
          You pay the price shown — College Crew&apos;s 15% comes out of the
          provider&apos;s earnings.
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
          {booking.status === "accepted" && redirectStatus === "succeeded" ? (
            // Stripe already took the payment; the webhook flips the status
            // moments later. Don't re-show the pay button in the gap.
            <div className="rounded-lg border border-quad-200 bg-quad-50 p-4 text-sm text-quad-800">
              Payment received — finalizing your booking. Refresh in a moment.
            </div>
          ) : booking.status === "accepted" && addendum ? (
            <ConfirmPayPanel
              bookingId={booking.id}
              simulateAllowed={process.env.NODE_ENV !== "production"}
            />
          ) : booking.status === "accepted" ? (
            <div className="rounded-lg border border-line bg-court p-4 text-sm text-ink-soft">
              This booking needs a service-specific risk addendum before
              payment can continue.
            </div>
          ) : booking.status === "paid" || booking.status === "completed" ? (
            <div className="rounded-lg border border-quad-200 bg-quad-50 p-4 text-sm text-quad-800">
              This booking is confirmed and paid. You&apos;re all set.
            </div>
          ) : booking.status === "requested" ? (
            <div className="rounded-lg border border-line bg-court p-4 text-sm text-ink-soft">
              Still waiting on the provider — you&apos;ll be able to confirm
              and pay once they accept.
            </div>
          ) : (
            <div className="rounded-lg border border-line bg-court p-4 text-sm text-ink-soft">
              This booking is no longer active.
            </div>
          )}
        </div>
      </Card>

      <p className="text-center">
        <Link
          href="/dashboard"
          className={buttonClasses({ variant: "ghost", size: "sm" })}
        >
          ← Back to dashboard
        </Link>
      </p>
    </div>
  );
}
