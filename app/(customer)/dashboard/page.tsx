import type { Metadata } from "next";
import Link from "next/link";

import { openConversationForBooking } from "@/app/actions/messaging";
import { StatusPill } from "@/components/status-pill";
import { buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { RealtimeRefresh } from "@/components/realtime-refresh";
import { requireRole } from "@/lib/auth/session";
import type { BookingStatus } from "@/lib/db/types";
import { createClient } from "@/lib/supabase/server";
import { cn, formatDateTime, formatMoney } from "@/lib/utils";

import { cancelBooking } from "./actions";
import { ReviewForm } from "./review-form";

export const metadata: Metadata = { title: "My bookings" };

const UPCOMING: BookingStatus[] = ["requested", "accepted", "paid"];

type BookingRow = {
  id: string;
  status: BookingStatus;
  scheduled_at: string;
  address: string;
  price_cents: number;
  service: { name: string };
  provider: { display_name: string };
  review: { id: string } | null;
};

export default async function CustomerDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; requested?: string; paid?: string }>;
}) {
  const [{ tab, requested, paid }, session] = await Promise.all([
    searchParams,
    requireRole("customer", "/dashboard"),
  ]);
  const showPast = tab === "past";

  const supabase = await createClient();
  const { data } = await supabase
    .from("bookings")
    .select(
      "id, status, scheduled_at, address, price_cents, service:services(name), provider:provider_profiles(display_name), review:reviews(id)",
    )
    .eq("customer_id", session.user.id)
    .order("scheduled_at", { ascending: showPast ? false : true });

  const bookings = ((data ?? []) as BookingRow[]).filter((booking) =>
    showPast
      ? !UPCOMING.includes(booking.status)
      : UPCOMING.includes(booking.status),
  );

  const tabClass = (active: boolean) =>
    cn(
      "rounded-lg px-4 py-2 text-sm font-semibold transition-colors",
      active ? "bg-crew-600 text-white" : "text-ink-soft hover:bg-crew-50",
    );

  return (
    <div className="space-y-6">
      <RealtimeRefresh
        channel={`customer-bookings:${session.user.id}`}
        table="bookings"
        filter={`customer_id=eq.${session.user.id}`}
      />
      <PageHeader
        title="My bookings"
        actions={
          <Link href="/browse" className={buttonClasses({ size: "sm" })}>
            Book something new
          </Link>
        }
      />

      {requested ? (
        <div className="rounded-lg border border-quad-200 bg-quad-50 p-4 text-sm text-quad-800">
          Request sent. The provider will accept or decline — once they
          accept, you&apos;ll confirm and pay here.
        </div>
      ) : null}
      {paid ? (
        <div className="rounded-lg border border-quad-200 bg-quad-50 p-4 text-sm text-quad-800">
          Booking confirmed — you&apos;re on the schedule.
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

      {bookings.length === 0 ? (
        <EmptyState
          title={showPast ? "No past bookings" : "Nothing booked yet"}
          action={
            <Link
              href="/browse"
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
      ) : (
        <ul className="space-y-4">
          {bookings.map((booking) => (
            <li key={booking.id}>
              <Card className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-display text-lg font-semibold">
                      {booking.service.name}
                    </p>
                    <p className="mt-0.5 text-sm text-ink-soft">
                      with {booking.provider.display_name} ·{" "}
                      {formatDateTime(booking.scheduled_at)}
                    </p>
                    <p className="mt-0.5 text-xs text-mist">
                      {booking.address} · {formatMoney(booking.price_cents)}
                    </p>
                  </div>
                  <StatusPill status={booking.status} />
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  {booking.status === "accepted" ? (
                    <Link
                      href={`/bookings/${booking.id}/confirm`}
                      className={buttonClasses({ size: "sm" })}
                    >
                      Confirm & pay
                    </Link>
                  ) : null}

                  {(UPCOMING as string[]).includes(booking.status) ? (
                    <form action={openConversationForBooking}>
                      <input type="hidden" name="bookingId" value={booking.id} />
                      <button
                        type="submit"
                        className={buttonClasses({
                          variant: "secondary",
                          size: "sm",
                        })}
                      >
                        Message
                      </button>
                    </form>
                  ) : null}

                  {booking.status === "requested" ||
                  booking.status === "accepted" ? (
                    <form action={cancelBooking}>
                      <input type="hidden" name="bookingId" value={booking.id} />
                      <button
                        type="submit"
                        className={buttonClasses({
                          variant: "danger",
                          size: "sm",
                        })}
                      >
                        Cancel request
                      </button>
                    </form>
                  ) : null}
                </div>

                {booking.status === "completed" ? (
                  <div className="mt-4 border-t border-line pt-4">
                    {booking.review ? (
                      <p className="text-sm font-medium text-quad-700">
                        Reviewed ✓
                      </p>
                    ) : (
                      <ReviewForm bookingId={booking.id} />
                    )}
                  </div>
                ) : null}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
