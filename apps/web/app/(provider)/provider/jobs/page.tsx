import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { openConversationForBooking } from "@/app/actions/messaging";
import { BookingCopyProvider } from "@/components/content/booking-copy-provider";
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
  demoProviderProfile,
  getDemoPreview,
} from "@/lib/demo/sample-preview";
import type { BookingFlow, BookingStatus } from "@/lib/db/types";
import {
  bookingCopyValue,
  type BookingCopyOverrides,
} from "@/lib/content/booking-copy";
import { getBookingCopyOverrides } from "@/lib/content/booking-copy.server";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime, formatMoney } from "@/lib/utils";

import { completeBooking, markArrived } from "../actions";
import { ProviderCancelJob } from "../provider-cancel-job";
import { OnMyWayButton } from "./on-my-way-button";

export const metadata: Metadata = { title: "Jobs" };

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
  quote_estimate:
    | { estimated_minutes: number }
    | { estimated_minutes: number }[]
    | null;
  invoice: {
    subtotal_cents: number;
    total_platform_fee_cents: number;
    remaining_balance_cents: number;
    status: string;
  } | null;
};

type JobTab = "upcoming" | "completed" | "missed";

const jobTabs: { id: JobTab; label: string }[] = [
  { id: "upcoming", label: "Upcoming" },
  { id: "completed", label: "Completed" },
  { id: "missed", label: "Missed" },
];

/** Provider work queue, split into active, completed, and missed jobs. */
export default async function ProviderJobsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const activeTab: JobTab =
    tab === "completed" || tab === "missed" ? tab : "upcoming";
  const [session, copyOverrides] = await Promise.all([
    requireProviderAccess("/provider/jobs"),
    getBookingCopyOverrides("provider"),
  ]);
  const demoPreview = await getDemoPreview("provider");
  if (demoPreview) {
    return (
      <BookingCopyProvider overrides={copyOverrides}>
        <ProviderJobsView
          profile={demoProviderProfile}
          jobs={demoBookings.filter((booking) =>
            ["accepted", "paid"].includes(booking.status),
          ) as unknown as JobRow[]}
          copyOverrides={copyOverrides}
          activeTab={activeTab}
          demo
        />
      </BookingCopyProvider>
    );
  }

  const profile = await getOwnProviderProfile();
  if (!profile) redirect("/provider/onboarding/account");

  const supabase = await createClient();
  const [{ data: jobsData }, { data: timeOverride }] = await Promise.all([
    supabase
      .from("bookings")
      .select(
        `id, booking_flow, status, scheduled_at, address, service_city,
         latitude, longitude, price_cents,
         platform_fee_cents, hourly_rate_cents_snapshot, estimated_minutes,
         arrived_at, en_route_at, service:services(name),
         customer:profiles!bookings_customer_id_fkey(full_name),
         quote_estimate:booking_quote_provider_estimates(estimated_minutes),
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
      .from("site_content")
      .select("value")
      .eq("key", "booking.test-time-restrictions-disabled")
      .maybeSingle(),
  ]);
  const timeRestrictionsDisabled =
    timeOverride?.value.trim().toLowerCase() === "true";

  // Distance from the provider's operating address, computed here so raw
  // coordinates never leave the server render.
  const jobs = ((jobsData ?? []) as JobRow[]).map((job) => ({
    ...job,
    distance_miles: milesBetween(session.profile, job),
  }));
  return (
    <BookingCopyProvider overrides={copyOverrides}>
      <ProviderJobsView
        profile={profile}
        jobs={jobs}
        copyOverrides={copyOverrides}
        activeTab={activeTab}
        timeRestrictionsDisabled={timeRestrictionsDisabled}
      />
    </BookingCopyProvider>
  );
}

function ProviderJobsView({
  profile,
  jobs,
  copyOverrides,
  activeTab,
  timeRestrictionsDisabled = false,
  demo = false,
}: {
  profile: NonNullable<Awaited<ReturnType<typeof getOwnProviderProfile>>>;
  jobs: JobRow[];
  copyOverrides: BookingCopyOverrides;
  activeTab: JobTab;
  timeRestrictionsDisabled?: boolean;
  demo?: boolean;
}) {
  const copy = (
    key: Parameters<typeof bookingCopyValue>[1],
    values?: Record<string, string | number>,
  ) => bookingCopyValue(copyOverrides, key, values);
  const now = new Date();
  const mostRecentFirst = (left: JobRow, right: JobRow) =>
    new Date(right.scheduled_at).getTime() -
    new Date(left.scheduled_at).getTime();
  const completedJobs = jobs
    .filter((job) => job.status === "completed")
    .sort(mostRecentFirst);
  const missedJobs = jobs.filter((job) => isMissedJob(job, now)).sort(mostRecentFirst);
  const missedJobIds = new Set(missedJobs.map((job) => job.id));
  const upcomingJobs = jobs
    .filter(
      (job) => job.status !== "completed" && !missedJobIds.has(job.id),
    )
    .sort(
      (left, right) =>
        new Date(left.scheduled_at).getTime() -
        new Date(right.scheduled_at).getTime(),
    );
  const visibleJobs =
    activeTab === "completed"
      ? completedJobs
      : activeTab === "missed"
        ? missedJobs
        : upcomingJobs;
  const tabHeading = jobTabs.find((tab) => tab.id === activeTab)?.label ?? "Upcoming";
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
        title={copy("booking-provider.jobs.title")}
        description={copy("booking-provider.jobs.description")}
      />
      {demo ? <SamplePreviewBanner role="provider" /> : null}

      <section aria-labelledby={`${activeTab}-jobs`}>
        <div
          role="tablist"
          aria-label="Job status"
          className="flex w-fit items-center gap-1 rounded-xl border border-line bg-court p-1"
        >
          {jobTabs.map((tab) => {
            const selected = tab.id === activeTab;
            return (
              <Link
                key={tab.id}
                href={tab.id === "upcoming" ? "/provider/jobs" : `/provider/jobs?tab=${tab.id}`}
                role="tab"
                aria-selected={selected}
                className={
                  selected
                    ? "rounded-lg bg-shell px-3 py-1.5 text-sm font-semibold text-ink shadow-sm"
                    : "rounded-lg px-3 py-1.5 text-sm font-medium text-ink-soft transition-colors hover:text-ink"
                }
              >
                {tab.label}
              </Link>
            );
          })}
        </div>
        <h2 id={`${activeTab}-jobs`} className="mt-5 font-display text-xl font-semibold">
          {tabHeading} jobs
        </h2>
        <div className="mt-3 space-y-3">
          {visibleJobs.length === 0 ? (
            <EmptyState title={emptyTitle(activeTab, copy)}>
              {emptyBody(activeTab, copy)}
            </EmptyState>
          ) : (
            visibleJobs.map((job) => (
              <Card key={job.id} data-booking-id={job.id} className="flex min-h-52 flex-col p-4">
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
                <div className="mt-auto flex min-h-14 flex-wrap items-end gap-2 border-t border-line pt-3">
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
                      <JobMilestoneActions
                        job={job}
                        timeRestrictionsDisabled={timeRestrictionsDisabled}
                      />
                      {["hourly_v1", "quote_v2"].includes(job.booking_flow) &&
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
    </div>
  );
}

function estimatedMinutes(job: JobRow) {
  const quoteEstimate = Array.isArray(job.quote_estimate)
    ? job.quote_estimate[0]
    : job.quote_estimate;
  return quoteEstimate?.estimated_minutes ?? job.estimated_minutes ?? 60;
}

/** A no-invoice job is only missed 24 hours after its estimated end time. */
function isMissedJob(job: JobRow, now: Date) {
  if (
    !["paid", "booked", "in_progress"].includes(job.status) ||
    job.invoice
  ) {
    return false;
  }
  const estimatedEnd =
    new Date(job.scheduled_at).getTime() + estimatedMinutes(job) * 60 * 1000;
  return now.getTime() >= estimatedEnd + 24 * 60 * 60 * 1000;
}

function emptyTitle(
  tab: JobTab,
  copy: (key: Parameters<typeof bookingCopyValue>[1]) => string,
) {
  if (tab === "completed") return "No completed jobs yet";
  if (tab === "missed") return "No missed jobs";
  return copy("booking-provider.jobs.empty-title");
}

function emptyBody(
  tab: JobTab,
  copy: (key: Parameters<typeof bookingCopyValue>[1]) => string,
) {
  if (tab === "completed") return "Completed jobs will appear here after payment is settled.";
  if (tab === "missed") return "Jobs without an invoice appear here 24 hours after their estimated end time.";
  return copy("booking-provider.jobs.empty-body");
}

/** Status-driven job actions: full-price completion + hourly work milestones. */
function JobMilestoneActions({
  job,
  timeRestrictionsDisabled,
}: {
  job: JobRow;
  timeRestrictionsDisabled: boolean;
}) {
  if (!["hourly_v1", "quote_v2"].includes(job.booking_flow)) {
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
      const canSendEnRoute = timeRestrictionsDisabled || now >= enRouteUnlock;
      const canArrive = timeRestrictionsDisabled || now >= arrivalUnlock;
      return (
        <div className="flex flex-wrap items-center gap-3">
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
            <div className="flex flex-wrap items-center gap-2">
              <form action={markArrived}>
                <input type="hidden" name="bookingId" value={job.id} />
                <Button type="submit" variant="secondary" size="sm">
                  Arrived
                </Button>
              </form>
              <p className="max-w-48 text-xs text-mist">
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
