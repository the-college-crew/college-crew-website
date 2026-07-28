import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { BookingCopyProvider } from "@/components/content/booking-copy-provider";
import { DeadlineCountdown } from "@/components/deadline-countdown";
import { buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { requireRole } from "@/lib/auth/session";
import {
  QUOTE_DAYPART_LABELS,
  type QuoteDaypart,
} from "@/lib/booking/quote-dayparts";
import { bookingCopyValue } from "@/lib/content/booking-copy";
import { getBookingCopyOverrides } from "@/lib/content/booking-copy.server";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime, formatLocalDate, formatMoney } from "@/lib/utils";

import {
  CounterOfferActions,
  QuoteCounterOptionActions,
} from "./counter-form";

export const metadata: Metadata = { title: "A new time was suggested" };

export default async function CounterOfferPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [{ id }, session, copyOverrides] = await Promise.all([
    params,
    requireRole("customer", "/dashboard"),
    getBookingCopyOverrides("customer"),
  ]);
  const copy = (
    key: Parameters<typeof bookingCopyValue>[1],
    values?: Record<string, string | number>,
  ) => bookingCopyValue(copyOverrides, key, values);
  const supabase = await createClient();
  const { data: booking } = await supabase
    .from("bookings")
    .select(
      `id, status, booking_flow, scheduled_at, proposed_start_at, counter_note,
       hourly_rate_cents_snapshot, provider_display_name_snapshot,
       requested_local_date, requested_daypart, quote_negotiation_round,
       service:services(name)`,
    )
    .eq("id", id)
    .eq("customer_id", session.user.id)
    .maybeSingle();
  if (
    !booking ||
    !["hourly_v1", "quote_v2"].includes(booking.booking_flow)
  ) {
    notFound();
  }

  const service = Array.isArray(booking.service) ? booking.service[0] : booking.service;
  const providerName = booking.provider_display_name_snapshot ?? "Your student";
  const isQuote = booking.booking_flow === "quote_v2";
  const { data: quoteOptions } = isQuote
    ? await supabase
        .from("booking_quote_counter_options")
        .select("id, local_date, daypart, expires_at")
        .eq("booking_id", booking.id)
        .eq("round_number", booking.quote_negotiation_round)
        .is("selected_at", null)
        .order("ordinal")
    : { data: null };
  const options = (quoteOptions ?? []) as Array<{
    id: string;
    local_date: string;
    daypart: QuoteDaypart;
    expires_at: string;
  }>;
  const open =
    booking.status === "countered" &&
    (isQuote ? options.length > 0 : booking.proposed_start_at != null);

  return (
    <BookingCopyProvider overrides={copyOverrides}>
      <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        title={copy("booking-customer.counter.title")}
        description={[service?.name, providerName].filter(Boolean).join(" · ")}
      />

      {!open ? (
        <Card className="p-6 text-sm text-ink-soft">
          {copy("booking-customer.counter.closed")}
        </Card>
      ) : (
        <>
          {isQuote ? (
            <>
              <Card className="space-y-4 p-6">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-mist">
                    Your requested window
                  </p>
                  <p className="mt-1 font-medium">
                    {booking.requested_local_date
                      ? formatLocalDate(booking.requested_local_date)
                      : "Requested date"} ·{" "}
                    {booking.requested_daypart
                      ? QUOTE_DAYPART_LABELS[
                          booking.requested_daypart as QuoteDaypart
                        ]
                      : "Flexible"}
                  </p>
                </div>
                {booking.counter_note ? (
                  <p className="rounded-xl border border-line bg-court p-3 text-sm text-ink-soft">
                    “{booking.counter_note}”
                  </p>
                ) : null}
                <p className="text-sm text-ink-soft">
                  {providerName} can offer the following windows; choosing one
                  sends the saved request back so they can set an exact start
                  time and final quote.
                </p>
                {options[0] ? (
                  <DeadlineCountdown
                    target={options[0].expires_at}
                    label="Options expire"
                  />
                ) : null}
              </Card>
              <QuoteCounterOptionActions
                bookingId={booking.id}
                options={options}
              />
            </>
          ) : (
            <>
          <Card className="space-y-4 p-6">
            <div className="flex items-start justify-between gap-4 text-sm">
              <span className="text-mist">
                {copy("booking-customer.counter.requested-label")}
              </span>
              <span className="text-right text-ink-soft line-through">
                {formatDateTime(booking.scheduled_at!)}
              </span>
            </div>
            <div className="flex items-start justify-between gap-4 border-t border-line pt-4 text-sm">
              <span className="font-medium text-ink">
                {copy("booking-customer.counter.proposed-label", {
                  provider_name: providerName,
                })}
              </span>
              <span className="text-right font-semibold text-quad-700">
                {formatDateTime(booking.proposed_start_at!)}
              </span>
            </div>
            {booking.counter_note ? (
              <p className="rounded-xl border border-line bg-court p-3 text-sm text-ink-soft">
                “{booking.counter_note}”
              </p>
            ) : null}
          </Card>

          <Card className="p-4 text-xs text-mist">
            {copy("booking-customer.counter.hold-note", {
              hold_amount:
                booking.hourly_rate_cents_snapshot != null
                  ? formatMoney(booking.hourly_rate_cents_snapshot)
                  : "card",
            })}
          </Card>

          <CounterOfferActions bookingId={booking.id} />
            </>
          )}
        </>
      )}

      <Link href="/dashboard" className={buttonClasses({ variant: "ghost", size: "sm" })}>
        ← Back to my bookings
      </Link>
      </div>
    </BookingCopyProvider>
  );
}
