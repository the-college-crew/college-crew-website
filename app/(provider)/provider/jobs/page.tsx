import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { openConversationForBooking } from "@/app/actions/messaging";
import { StatusPill } from "@/components/status-pill";
import { Button, buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { getOwnProviderProfile, requireRole } from "@/lib/auth/session";
import type { BookingStatus } from "@/lib/db/types";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime, formatMoney, formatOfferedPrice } from "@/lib/utils";

import { completeBooking } from "../actions";

export const metadata: Metadata = { title: "Jobs & pricing" };

type JobRow = {
  id: string;
  status: BookingStatus;
  scheduled_at: string;
  address: string;
  price_cents: number;
  platform_fee_cents: number;
  service: { name: string };
  customer: { full_name: string };
};

/** Upcoming jobs + read-only pricing (editing lives in Profile & settings). */
export default async function ProviderJobsPage() {
  await requireRole("provider", "/provider/jobs");
  const profile = await getOwnProviderProfile();
  if (!profile) redirect("/provider/onboarding/account");

  const supabase = await createClient();
  const [{ data: jobsData }, { data: offerings }] = await Promise.all([
    supabase
      .from("bookings")
      .select(
        "id, status, scheduled_at, address, price_cents, platform_fee_cents, service:services(name), customer:profiles(full_name)",
      )
      .eq("provider_id", profile.id)
      .in("status", ["accepted", "paid"])
      .order("scheduled_at", { ascending: true }),
    supabase
      .from("provider_services")
      .select("id, price_cents, price_type, unit, service:services(name)")
      .eq("provider_id", profile.id),
  ]);

  const jobs = (jobsData ?? []) as JobRow[];

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={profile.display_name}
        title="Jobs & pricing"
        description="Your upcoming jobs, and the pricing customers currently see."
      />

      <section aria-labelledby="upcoming-jobs">
        <h2
          id="upcoming-jobs"
          className="font-display text-xl font-semibold uppercase tracking-wide"
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
              <Card key={job.id} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-display text-lg font-semibold uppercase tracking-wide">
                      {job.service.name}
                    </p>
                    <p className="mt-0.5 text-sm text-ink-soft">
                      {job.customer.full_name} · {formatDateTime(job.scheduled_at)}
                    </p>
                    <p className="mt-0.5 text-xs text-mist">{job.address}</p>
                  </div>
                  <StatusPill status={job.status} />
                </div>
                <p className="mt-2 text-sm font-semibold text-quad-700">
                  {formatMoney(job.price_cents - job.platform_fee_cents)}{" "}
                  <span className="text-xs font-normal text-mist">
                    your payout
                  </span>
                </p>
                <div className="mt-3 flex gap-2">
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
                  {job.status === "paid" ? (
                    <form action={completeBooking}>
                      <input type="hidden" name="bookingId" value={job.id} />
                      <Button type="submit" variant="success" size="sm">
                        Mark completed
                      </Button>
                    </form>
                  ) : (
                    <span className="self-center text-xs text-mist">
                      Waiting on customer payment
                    </span>
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
            className="font-display text-xl font-semibold uppercase tracking-wide"
          >
            Your pricing
          </h2>
          <Link
            href="/provider/settings"
            className={buttonClasses({ variant: "ghost", size: "sm" })}
          >
            Edit in Profile & settings →
          </Link>
        </div>
        <Card className="mt-3 p-4">
          {!offerings || offerings.length === 0 ? (
            <p className="text-sm text-mist">
              No services yet — set them up in Profile & settings.
            </p>
          ) : (
            <ul className="divide-y divide-line text-sm">
              {offerings.map((offered) => (
                <li
                  key={offered.id}
                  className="flex justify-between gap-4 py-2.5"
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
            Read-only here on purpose — pricing is edited in one place
            (Profile & settings) so your public profile always matches.
          </p>
        </Card>
      </section>
    </div>
  );
}
