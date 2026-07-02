import type { Metadata } from "next";
import { redirect } from "next/navigation";

import {
  MonthCalendar,
  type CalendarBooking,
} from "@/components/month-calendar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { getOwnProviderProfile, requireRole } from "@/lib/auth/session";
import type { BookingStatus } from "@/lib/db/types";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime, formatMoney } from "@/lib/utils";

import { acceptBooking, connectStripe, declineBooking } from "../actions";

export const metadata: Metadata = { title: "Provider dashboard" };

type ProviderBookingRow = {
  id: string;
  status: BookingStatus;
  scheduled_at: string;
  address: string;
  details: string;
  price_cents: number;
  platform_fee_cents: number;
  service: { name: string };
  customer: { full_name: string };
};

const net = (b: ProviderBookingRow) => b.price_cents - b.platform_fee_cents;

export default async function ProviderDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ submitted?: string; stripe?: string }>;
}) {
  const [{ submitted, stripe }] = await Promise.all([
    searchParams,
    requireRole("provider", "/provider/dashboard"),
  ]);
  const profile = await getOwnProviderProfile();
  if (!profile) redirect("/provider/onboarding/account");

  const supabase = await createClient();
  const { data } = await supabase
    .from("bookings")
    .select(
      "id, status, scheduled_at, address, details, price_cents, platform_fee_cents, service:services(name), customer:profiles(full_name)",
    )
    .eq("provider_id", profile.id)
    .order("scheduled_at", { ascending: true });

  const bookings = (data ?? []) as ProviderBookingRow[];
  const requests = bookings.filter((b) => b.status === "requested");
  const earnedCents = bookings
    .filter((b) => b.status === "completed")
    .reduce((sum, b) => sum + net(b), 0);
  const bookedCents = bookings
    .filter((b) => b.status === "paid")
    .reduce((sum, b) => sum + net(b), 0);

  const calendarBookings: CalendarBooking[] = bookings
    .filter((b) => ["accepted", "paid", "completed"].includes(b.status))
    .map((b) => ({
      id: b.id,
      scheduled_at: b.scheduled_at,
      status: b.status,
      serviceName: b.service.name,
      address: b.address,
      customerName: b.customer.full_name,
    }));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={profile.display_name}
        title="Dashboard"
        description="Requests, earnings, and your month at a glance."
      />

      {/* Status banners */}
      {submitted ? (
        <div className="rounded-lg border border-quad-200 bg-quad-50 p-4 text-sm text-quad-800">
          Onboarding submitted — a founder is reviewing your ID. You&apos;ll
          go live in Browse once approved.
        </div>
      ) : null}
      {profile.verification_status === "pending" && !submitted ? (
        <div className="rounded-lg border border-gold-400/60 bg-gold-100 p-4 text-sm text-gold-800">
          Verification under review. You can fine-tune your profile and
          pricing while you wait.
        </div>
      ) : null}
      {profile.verification_status === "rejected" ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          Your verification was rejected. Re-upload a clearer student ID from
          the onboarding wizard, or contact the founders.
        </div>
      ) : null}
      {profile.verification_status === "approved" &&
      !profile.stripe_account_id ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-crew-200 bg-crew-100 p-4 text-sm text-crew-800">
          <p>
            <span className="font-semibold">You&apos;re approved!</span> Connect
            Stripe to get paid — payouts go straight to your bank.
          </p>
          <form action={connectStripe}>
            <Button type="submit" size="sm">
              Connect Stripe
            </Button>
          </form>
        </div>
      ) : null}
      {stripe === "pending" ? (
        <div className="rounded-lg border border-gold-400/60 bg-gold-100 p-4 text-sm text-gold-800">
          Stripe isn&apos;t live yet — the platform&apos;s test account is
          still being set up. You&apos;ll be able to connect soon.
        </div>
      ) : null}

      {/* Earnings summary */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Earned", value: formatMoney(earnedCents), hint: "completed jobs" },
          { label: "Booked", value: formatMoney(bookedCents), hint: "paid, upcoming" },
          { label: "Requests", value: String(requests.length), hint: "awaiting reply" },
        ].map((stat) => (
          <Card key={stat.label} className="p-4 text-center sm:p-5">
            <p className="font-display text-2xl font-bold text-crew-700 sm:text-3xl">
              {stat.value}
            </p>
            <p className="font-display text-xs font-semibold uppercase tracking-[0.14em] text-mist">
              {stat.label}
            </p>
            <p className="text-[11px] text-mist">{stat.hint}</p>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* New requests */}
        <section aria-labelledby="requests">
          <h2
            id="requests"
            className="font-display text-xl font-semibold uppercase tracking-wide"
          >
            New requests
          </h2>
          <div className="mt-3 space-y-3">
            {requests.length === 0 ? (
              <EmptyState title="No new requests">
                Booking requests land here — accept or decline, and the
                customer pays after you accept.
              </EmptyState>
            ) : (
              requests.map((booking) => (
                <Card key={booking.id} pennant className="p-4">
                  <p className="font-display text-lg font-semibold uppercase tracking-wide">
                    {booking.service.name}
                  </p>
                  <p className="mt-0.5 text-sm text-ink-soft">
                    {booking.customer.full_name} ·{" "}
                    {formatDateTime(booking.scheduled_at)}
                  </p>
                  <p className="mt-0.5 text-xs text-mist">{booking.address}</p>
                  {booking.details ? (
                    <p className="mt-2 rounded-lg bg-court p-2 text-xs text-ink-soft">
                      {booking.details}
                    </p>
                  ) : null}
                  <p className="mt-2 text-sm">
                    <span className="font-semibold text-quad-700">
                      {formatMoney(net(booking))}
                    </span>{" "}
                    <span className="text-xs text-mist">
                      your cut of {formatMoney(booking.price_cents)} (after the
                      15% platform fee)
                    </span>
                  </p>
                  <div className="mt-3 flex gap-2">
                    <form action={acceptBooking}>
                      <input type="hidden" name="bookingId" value={booking.id} />
                      <Button type="submit" variant="success" size="sm">
                        Accept
                      </Button>
                    </form>
                    <form action={declineBooking}>
                      <input type="hidden" name="bookingId" value={booking.id} />
                      <Button type="submit" variant="danger" size="sm">
                        Decline
                      </Button>
                    </form>
                  </div>
                </Card>
              ))
            )}
          </div>
        </section>

        {/* Month calendar */}
        <section aria-labelledby="calendar">
          <h2
            id="calendar"
            className="font-display text-xl font-semibold uppercase tracking-wide"
          >
            Your month
          </h2>
          <Card className="mt-3 p-4">
            <MonthCalendar bookings={calendarBookings} />
          </Card>
        </section>
      </div>
    </div>
  );
}
