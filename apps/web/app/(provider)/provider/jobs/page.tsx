import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { openConversationForBooking } from "@/app/actions/messaging";
import { SamplePreviewBanner } from "@/components/sample-preview-banner";
import { StatusPill } from "@/components/status-pill";
import { Button, buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { LocationLine } from "@/components/provider-card";
import { RealtimeRefresh } from "@/components/realtime-refresh";
import { RefreshAt } from "@/components/refresh-at";
import {
  getOwnProviderProfile,
  requireProviderAccess,
} from "@/lib/auth/session";
import { milesBetween } from "@/lib/geo/distance";
import {
  demoBookings,
  demoOfferings,
  demoProviderProfile,
  getDemoPreview,
} from "@/lib/demo/sample-preview";
import type { BookingFlow, BookingStatus } from "@/lib/db/types";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime, formatMoney, formatOfferedPrice } from "@/lib/utils";

import { completeBooking, markArrived } from "../actions";
import { ProviderCancelJob } from "../provider-cancel-job";
import { OnMyWayButton } from "./on-my-way-button";

export const metadata: Metadata = { title: "Jobs & pricing" };

const ARRIVAL_GRACE_MS = 30 * 60 * 1000;
const EN_ROUTE_GRACE_MS = 2 * 60 * 60 * 1000;

type JobRow = {
  id: string;
  booking_flow: BookingFlow;
  status: BookingStatus;
  scheduled_at: string;
  address: string;
  service_city: string;
  latitude: number | null;
  longitude: number | null;
  /** Miles from the provider's operating address; computed server-side. */
  distance_miles?: number | null;
  price_cents: number;
  platform_fee_cents: number;
  hourly_rate_cents_snapshot: number | null;
  estimated_minutes: number | null;
  arrived_at: string | null;
  en_route_at: string | null;
  service: { name: string };
  customer: { full_name: string };
  invoice: {
    subtotal_cents: number;
    total_platform_fee_cents: number;
    remaining_balance_cents: number;
    status: string;
  } | null;
};

/** Upcoming jobs + read-only pricing (editing lives in Profile & settings). */
export default async function ProviderJobsPage() {
  const session = await requireProviderAccess("/provider/jobs");
  const demoPreview = await getDemoPreview("provider");
  if (demoPreview) {
    return (
      <ProviderJobsView
        profile={demoProviderProfile}
        jobs={demoBookings.filter((booking) =>
          ["accepted", "paid"].includes(booking.status),
        ) as unknown as JobRow[]}
        offerings={demoOfferings}
        demo
      />
    );
  }

  const profile = await getOwnProviderProfile();
  if (!profile) redirect("/provider/onboarding/account");

  const supabase = await createClient();
  const [{ data: jobsData }, { data: offerings }] = await Promise.all([
    supabase
      .from("bookings")
      .select(
        `id, booking_flow, status, scheduled_at, address, service_city,
         latitude, longitude, price_cents,
         platform_fee_cents, hourly_rate_cents_snapshot, estimated_minutes,
         arrived_at, en_route_at, service:services(name),
         customer:profiles!bookings_customer_id_fkey(full_name),
         invoice:booking_invoices(subtotal_cents, total_platform_fee_cents,
           remaining_balance_cents, status)`,
      )
      .eq("provider_id", profile.id)
      .in("status", [
        "accepted",
        "paid",
        "booked",
        "in_progress",
        "invoice_review",
        "completed",
      ])
      .order("scheduled_at", { ascending: true }),
    supabase
      .from("provider_services")
      .select(
        "id, hourly_rate_cents, pricing_mode, average_quote_cents, service:services(name, is_live)",
      )
      .eq("provider_id", profile.id),
  ]);

  // Distance from the provider's operating address, computed here so raw
  // coordinates never leave the server render.
  const jobs = ((jobsData ?? []) as JobRow[]).map((job) => ({
    ...job,
    distance_miles: milesBetween(session.profile, job),
  }));
  const liveOfferings = (offerings ?? []).filter(
    (offered) => offered.service?.is_live,
  );

  return (
    <ProviderJobsView
      profile={profile}
      jobs={jobs}
      offerings={liveOfferings}
    />
  );
}

function ProviderJobsView({
  profile,
  jobs,
  offerings,
  demo = false,
}: {
  profile: NonNullable<Awaited<ReturnType<typeof getOwnProviderProfile>>>;
  jobs: JobRow[];
  offerings: {
    id?: string;
    hourly_rate_cents: number | null;
    pricing_mode: string;
    average_quote_cents: number | null;
    service: { name: string; is_live?: boolean };
  }[];
  demo?: boolean;
}) {
  return (
    <div className="space-y-8">
      {demo ? null : (
        <>
          <RealtimeRefresh
            channel={`provider-jobs:${profile.id}`}
            table="bookings"
            filter={`provider_id=eq.${profile.id}`}
          />
          <RealtimeRefresh
            channel={`provider-job-invoices:${profile.id}`}
            table="booking_invoices"
          />
          <RealtimeRefresh
            channel={`provider-job-disputes:${profile.id}`}
            table="booking_disputes"
          />
        </>
      )}
      <PageHeader
        title="Jobs & pricing"
        description="Your upcoming jobs, and the pricing customers currently see."
      />
      {demo ? <SamplePreviewBanner role="provider" /> : null}

      <section aria-labelledby="upcoming-jobs">
        <h2
          id="upcoming-jobs"
          className="font-display text-xl font-semibold"
        >
          Upcoming jobs
        </h2>
        <div className="mt-3 space-y-3">
          {jobs.length === 0 ? (
            <EmptyState title="No jobs on the books">
              Accepted and paid bookings show up here with everything you need
              to show up and get it done.
            </EmptyState>
          ) : (
            jobs.map((job) => (
              <Card key={job.id} data-booking-id={job.id} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-display text-lg font-semibold">
                      {job.service.name}
                    </p>
                    <p className="mt-0.5 text-sm text-ink-soft">
                      {job.customer.full_name} · {formatDateTime(job.scheduled_at)}
                    </p>
                    <p className="mt-0.5">
                      <LocationLine
                        town={job.service_city ?? ""}
                        distanceMiles={job.distance_miles ?? null}
                      />
                    </p>
                    <p className="mt-0.5 text-xs text-mist">{job.address}</p>
                  </div>
                  <StatusPill status={job.status} />
                </div>
                {job.booking_flow === "hourly_v1" ? (
                  job.invoice ? (
                    <p className="mt-2 text-sm font-semibold text-quad-700">
                      {formatMoney(
                        job.invoice.subtotal_cents -
                          job.invoice.total_platform_fee_cents,
                      )}{" "}
                      <span className="text-xs font-normal text-mist">
                        your payout
                      </span>
                    </p>
                  ) : (
                    <p className="mt-2 text-sm text-ink-soft">
                      <span className="font-semibold text-quad-700">
                        {formatMoney(job.hourly_rate_cents_snapshot ?? 0)}/hr
                      </span>{" "}
                      <span className="text-xs text-mist">
                        · {job.estimated_minutes ?? 60} min estimate · payout
                        after invoice
                      </span>
                    </p>
                  )
                ) : (
                  <p className="mt-2 text-sm font-semibold text-quad-700">
                    {formatMoney(job.price_cents - job.platform_fee_cents)}{" "}
                    <span className="text-xs font-normal text-mist">
                      your payout
                    </span>
                  </p>
                )}
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {demo ? (
                    <>
                      <Link
                        href="/messages/demo"
                        className={buttonClasses({
                          variant: "secondary",
                          size: "sm",
                        })}
                      >
                        Message customer
                      </Link>
                      <Button
                        type="button"
                        variant="success"
                        size="sm"
                        disabled
                      >
                        Mark completed
                      </Button>
                    </>
                  ) : (
                    <>
                      <form action={openConversationForBooking}>
                        <input type="hidden" name="bookingId" value={job.id} />
                        <button
                          type="submit"
                          className={buttonClasses({
                            variant: "secondary",
                            size: "sm",
                          })}
                        >
                          Message customer
                        </button>
                      </form>
                      <JobMilestoneActions job={job} />
                      {job.booking_flow === "hourly_v1" &&
                      !job.arrived_at &&
                      (job.status === "accepted" || job.status === "booked") ? (
                        <ProviderCancelJob bookingId={job.id} />
                      ) : null}
                    </>
                  )}
                </div>
              </Card>
            ))
          )}
        </div>
      </section>

      <section aria-labelledby="pricing">
        <div className="flex items-center justify-between">
          <h2
            id="pricing"
            className="font-display text-xl font-semibold"
          >
            Your pricing
          </h2>
          <Link
            href="/account"
            className={buttonClasses({ variant: "ghost", size: "sm" })}
          >
            Edit in Profile & settings →
          </Link>
        </div>
        <Card className="mt-3 p-4">
          {offerings.length === 0 ? (
            <p className="text-sm text-mist">
              No live services yet — set them up in Profile & settings.
            </p>
          ) : (
            <ul className="divide-y divide-line text-sm">
              {offerings.map((offered, index) => (
                <li
                  key={offered.id ?? `${offered.service.name}-${index}`}
                  className="flex flex-wrap justify-between gap-x-4 gap-y-1 py-2.5"
                >
                  <span className="font-medium">{offered.service.name}</span>
                  <span className="font-semibold text-quad-700">
                    {formatOfferedPrice(offered)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 border-t border-line pt-3 text-xs text-mist">
            Read-only here — rates are edited in Profile & settings so your
            public profile always matches. Hidden services reappear if a
            founder relists them.
          </p>
        </Card>
      </section>
    </div>
  );
}

/** Status-driven job actions: full-price completion + hourly work milestones. */
function JobMilestoneActions({ job }: { job: JobRow }) {
  if (job.booking_flow !== "hourly_v1") {
    if (job.status === "paid") {
      return (
        <form action={completeBooking}>
          <input type="hidden" name="bookingId" value={job.id} />
          <Button type="submit" variant="success" size="sm">
            Mark completed
          </Button>
        </form>
      );
    }
    return (
      <span className="self-center text-xs text-mist">
        Waiting on customer payment
      </span>
    );
  }

  switch (job.status) {
    case "accepted":
      return (
        <span className="self-center text-xs text-mist">
          Waiting on first-hour payment
        </span>
      );
    case "booked": {
      const now = new Date().getTime();
      const start = new Date(job.scheduled_at).getTime();
      const enRouteUnlock = start - EN_ROUTE_GRACE_MS;
      const arrivalUnlock = start - ARRIVAL_GRACE_MS;
      const canSendEnRoute = now >= enRouteUnlock;
      const canArrive = now >= arrivalUnlock;
      return (
        <div className="flex flex-wrap items-start gap-3">
          {!canSendEnRoute ? (
            <>
              <span className="self-center text-xs text-mist">
                “On my way” unlocks 2 hours before the start
              </span>
              <RefreshAt at={new Date(enRouteUnlock).toISOString()} />
            </>
          ) : job.en_route_at ? (
            <span className="self-center text-xs font-semibold text-quad-700">
              Customer notified ✓
            </span>
          ) : (
            <OnMyWayButton bookingId={job.id} />
          )}

          {canArrive ? (
            <div>
              <form action={markArrived}>
                <input type="hidden" name="bookingId" value={job.id} />
                <Button type="submit" size="sm">
                  Arrived
                </Button>
              </form>
              <p className="mt-1 max-w-48 text-xs text-mist">
                Marks work started and opens the invoice screen.
              </p>
            </div>
          ) : (
            <>
              <span className="self-center text-xs text-mist">
                “Arrived” unlocks 30 minutes before the start
              </span>
              <RefreshAt at={new Date(arrivalUnlock).toISOString()} />
            </>
          )}
        </div>
      );
    }
    case "in_progress":
      return (
        <Link
          href={`/provider/jobs/${job.id}/complete`}
          className={buttonClasses({ variant: "success", size: "sm" })}
        >
          Complete & invoice
        </Link>
      );
    case "invoice_review":
      return (
        <>
          <Link
            href={`/provider/jobs/${job.id}/complete`}
            className={buttonClasses({ variant: "secondary", size: "sm" })}
          >
            View invoice
          </Link>
          <span className="self-center text-xs text-mist">
            Awaiting customer payment
          </span>
        </>
      );
    case "completed":
      return (
        <span className="self-center text-xs font-medium text-quad-700">
          Completed ✓
        </span>
      );
    default:
      return null;
  }
}
