import type { Metadata } from "next";
import { redirect } from "next/navigation";

import {
  MonthCalendar,
  type CalendarBooking,
} from "@/components/month-calendar";
import { DeadlineCountdown } from "@/components/deadline-countdown";
import { SamplePreviewBanner } from "@/components/sample-preview-banner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { RealtimeRefresh } from "@/components/realtime-refresh";
import {
  ProviderReadinessChecklist,
  type ReadinessOffering,
} from "@/components/provider-readiness-checklist";
import { getOwnProviderProfile, requireRole } from "@/lib/auth/session";
import { releaseExpiredAcceptances } from "@/lib/booking/requests";
import { getVerifiedSchoolEmail } from "@/lib/db/school-email";
import {
  demoBookings,
  demoOfferings,
  demoProviderProfile,
  getDemoPreview,
} from "@/lib/demo/sample-preview";
import type { BookingFlow, BookingStatus } from "@/lib/db/types";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime, formatMoney } from "@/lib/utils";

import { connectStripe, refreshStripeReadiness } from "../actions";
import { RequestActions } from "./request-actions";

export const metadata: Metadata = { title: "Provider dashboard" };

type ProviderBookingRow = {
  id: string;
  booking_flow: BookingFlow;
  status: BookingStatus;
  scheduled_at: string;
  address: string;
  details: string;
  price_cents: number;
  platform_fee_cents: number;
  estimated_minutes: number | null;
  hourly_rate_cents_snapshot: number | null;
  response_alert_at: string | null;
  initial_payment_due_at: string | null;
  service: { name: string };
  customer: { full_name: string };
};

const net = (b: ProviderBookingRow) => b.price_cents - b.platform_fee_cents;

export default async function ProviderDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ submitted?: string; stripe?: string }>;
}) {
  const [{ submitted, stripe }, session] = await Promise.all([
    searchParams,
    requireRole("provider", "/provider/dashboard"),
  ]);
  const demoPreview = await getDemoPreview("provider");
  if (demoPreview) {
    return (
      <ProviderDashboardView
        profile={demoProviderProfile}
        bookings={demoBookings as ProviderBookingRow[]}
        offerings={demoOfferings.map((offering) => ({
          id: offering.id,
          name: offering.service.name,
          hourly_rate_cents: offering.hourly_rate_cents,
          service_is_live: offering.service.is_live,
        }))}
        submitted={submitted}
        stripe={stripe}
        onboardingComplete
        demo
      />
    );
  }

  const profile = await getOwnProviderProfile();
  if (!profile) redirect("/provider/onboarding/account");

  // Onboarding is complete only once the .edu is verified and both license
  // images are on record — otherwise the "under review" banner is misleading
  // and the layout's verify banner points them back to finish.
  const schoolEmail = await getVerifiedSchoolEmail(session.user.id);
  const onboardingComplete =
    Boolean(schoolEmail) &&
    Boolean(profile.id_document_url) &&
    Boolean(profile.id_document_back_url);

  const supabase = await createClient();
  const [{ data }, { data: offeringRows }] = await Promise.all([
    supabase
      .from("bookings")
      .select(
        `id, booking_flow, status, scheduled_at, address, details, price_cents,
         platform_fee_cents, estimated_minutes, hourly_rate_cents_snapshot,
         response_alert_at, initial_payment_due_at, service:services(name),
         customer:profiles!bookings_customer_id_fkey(full_name)`,
      )
      .eq("provider_id", profile.id)
      .order("scheduled_at", { ascending: true }),
    supabase
      .from("provider_services")
      .select("id, hourly_rate_cents, service:services(name, is_live)")
      .eq("provider_id", profile.id),
  ]);

  const rawBookings = (data ?? []) as ProviderBookingRow[];
  const expiredIds = await releaseExpiredAcceptances(supabase, rawBookings);
  const bookings = rawBookings.map((booking) =>
    expiredIds.has(booking.id)
      ? { ...booking, status: "expired" as BookingStatus }
      : booking,
  );
  const offerings: ReadinessOffering[] = (offeringRows ?? []).map(
    (offering) => ({
      id: offering.id,
      name: offering.service?.name ?? "Retired service",
      hourly_rate_cents: offering.hourly_rate_cents,
      service_is_live: offering.service?.is_live === true,
    }),
  );

  return (
    <ProviderDashboardView
      profile={profile}
      bookings={bookings}
      offerings={offerings}
      submitted={submitted}
      stripe={stripe}
      onboardingComplete={onboardingComplete}
    />
  );
}

function ProviderDashboardView({
  profile,
  bookings,
  offerings,
  submitted,
  stripe,
  onboardingComplete,
  demo = false,
}: {
  profile: NonNullable<Awaited<ReturnType<typeof getOwnProviderProfile>>>;
  bookings: ProviderBookingRow[];
  offerings: ReadinessOffering[];
  submitted?: string;
  stripe?: string;
  onboardingComplete: boolean;
  demo?: boolean;
}) {
  const now = new Date();
  const requests = bookings.filter(
    (booking) =>
      booking.status === "requested" &&
      (booking.booking_flow === "legacy" || new Date(booking.scheduled_at) > now),
  );
  const awaitingPayment = bookings.filter(
    (booking) =>
      booking.booking_flow === "hourly_v1" && booking.status === "accepted",
  );
  const earnedCents = bookings
    .filter((b) => b.status === "completed")
    .reduce((sum, b) => sum + net(b), 0);
  const bookedCents = bookings
    .filter((b) => ["paid", "booked"].includes(b.status))
    .reduce((sum, b) => sum + net(b), 0);

  const calendarBookings: CalendarBooking[] = bookings
    .filter((b) =>
      ["accepted", "paid", "booked", "in_progress", "completed"].includes(
        b.status,
      ),
    )
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
      {demo ? null : (
        <RealtimeRefresh
          channel={`provider-bookings:${profile.id}`}
          table="bookings"
          filter={`provider_id=eq.${profile.id}`}
        />
      )}
      <PageHeader
        title="Dashboard"
        description="Requests, earnings, and your month at a glance."
      />
      {demo ? <SamplePreviewBanner role="provider" /> : null}

      {/* Status banners */}
      {submitted && !demo ? (
        <div className="rounded-lg border border-quad-200 bg-quad-50 p-4 text-sm text-quad-800">
          Onboarding submitted — a founder is reviewing your ID. You&apos;ll
          go live in Browse once approved.
        </div>
      ) : null}
      {profile.verification_status === "pending" &&
      onboardingComplete &&
      !submitted &&
      !demo ? (
        <div className="rounded-lg border border-gold-400/60 bg-gold-100 p-4 text-sm text-gold-800">
          Verification under review. You can fine-tune your profile and
          hourly rates while you wait.
        </div>
      ) : null}
      {profile.verification_status === "rejected" && !demo ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          Your verification was rejected. Re-upload a clearer driver&apos;s
          license from the onboarding wizard, or contact the founders.
        </div>
      ) : null}
      {profile.verification_status === "approved" &&
      !profile.stripe_account_id &&
      !demo ? (
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
      {profile.verification_status === "approved" &&
      profile.stripe_account_id &&
      !profile.stripe_transfers_active &&
      !demo ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gold-300 bg-gold-100 p-4 text-sm text-gold-800">
          <p>
            Stripe still needs information before your services can accept
            hourly bookings.
          </p>
          <div className="flex flex-wrap gap-2">
            <form action={connectStripe}>
              <Button type="submit" size="sm" variant="secondary">
                Resume Stripe setup
              </Button>
            </form>
            <form action={refreshStripeReadiness}>
              <Button type="submit" size="sm" variant="ghost">
                Refresh status
              </Button>
            </form>
          </div>
        </div>
      ) : null}
      {stripe === "pending" && !demo ? (
        <div className="rounded-lg border border-gold-400/60 bg-gold-100 p-4 text-sm text-gold-800">
          Stripe isn&apos;t live yet — the platform&apos;s test account is
          still being set up. You&apos;ll be able to connect soon.
        </div>
      ) : null}

      <ProviderReadinessChecklist profile={profile} offerings={offerings} />

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
            <p className="font-display text-xs font-semibold text-mist">
              {stat.label}
            </p>
            <p className="text-[11px] text-mist">{stat.hint}</p>
          </Card>
        ))}
      </div>

      {awaitingPayment.length > 0 ? (
        <section aria-labelledby="awaiting-payment">
          <h2
            id="awaiting-payment"
            className="font-display text-xl font-semibold"
          >
            Awaiting customer payment
          </h2>
          <div className="mt-3 space-y-3">
            {awaitingPayment.map((booking) => (
              <Card key={booking.id} data-booking-id={booking.id} className="p-4">
                <p className="font-display text-lg font-semibold">
                  {booking.service.name}
                </p>
                <p className="mt-0.5 text-sm text-ink-soft">
                  {booking.customer.full_name} ·{" "}
                  {formatDateTime(booking.scheduled_at)}
                </p>
                <p className="mt-1 text-xs text-mist">
                  Reserved — the customer must pay the first hour to confirm.
                </p>
                {booking.initial_payment_due_at ? (
                  <div className="mt-2">
                    <DeadlineCountdown
                      target={booking.initial_payment_due_at}
                      label="First-hour payment due"
                    />
                  </div>
                ) : null}
              </Card>
            ))}
          </div>
        </section>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* New requests */}
        <section aria-labelledby="requests">
          <h2
            id="requests"
            className="font-display text-xl font-semibold"
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
                <Card
                  key={booking.id}
                  data-booking-id={booking.id}
                  pennant
                  className="p-4"
                >
                  <p className="font-display text-lg font-semibold">
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
                      snapshotted platform fee)
                    </span>
                  </p>
                  {booking.booking_flow === "hourly_v1" ? (
                    <div className="mt-2 space-y-1 text-xs text-mist">
                      <p>
                        {formatMoney(booking.hourly_rate_cents_snapshot ?? booking.price_cents)}/hr
                        {" · "}
                        {booking.estimated_minutes ?? 60}-minute estimate
                      </p>
                      {booking.response_alert_at ? (
                        <DeadlineCountdown
                          target={booking.response_alert_at}
                          label="Response requested"
                        />
                      ) : null}
                    </div>
                  ) : null}
                  {demo ? (
                    <div className="mt-3 flex gap-2">
                      <Button type="button" size="sm" disabled>
                        Accept
                      </Button>
                      <Button
                        type="button"
                        variant="danger"
                        size="sm"
                        disabled
                      >
                        Decline
                      </Button>
                    </div>
                  ) : (
                    <RequestActions
                      job={{
                        id: booking.id,
                        serviceName: booking.service.name,
                        customerName: booking.customer.full_name,
                        whenLabel: formatDateTime(booking.scheduled_at),
                        address: booking.address,
                      }}
                    />
                  )}
                </Card>
              ))
            )}
          </div>
        </section>

        {/* Month calendar */}
        <section aria-labelledby="calendar">
          <h2
            id="calendar"
            className="font-display text-xl font-semibold"
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
