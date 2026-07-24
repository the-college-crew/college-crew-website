import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { requireRole } from "@/lib/auth/session";
import { isOfferedStartTime } from "@/lib/booking/replacement-ranking";
import { getReplacementPool } from "@/lib/booking/replacement-suggestions";
import {
  hasAcceptedCurrentLegalDocument,
  legalDocumentPath,
} from "@/lib/legal/acceptance";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/utils";

import { ReplacementForm } from "./replacement-form";

export const metadata: Metadata = { title: "Pick another student" };

export default async function ReplacementPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ps?: string; at?: string }>;
}) {
  const [{ id }, { ps, at }, session] = await Promise.all([
    params,
    searchParams,
    requireRole("customer", "/dashboard"),
  ]);
  const supabase = await createClient();
  if (
    !(await hasAcceptedCurrentLegalDocument(supabase, {
      userId: session.user.id,
      kind: "customer_booking_terms",
    }))
  ) {
    redirect(legalDocumentPath("customer_booking_terms", `/bookings/${id}/replace`));
  }
  const { data: booking } = await supabase
    .from("bookings")
    .select(
      `id, booking_flow, status, scheduled_at, response_alert_at,
       cancelled_by_role, estimated_minutes, time_flexibility,
       service:services(name, slug)`,
    )
    .eq("id", id)
    .eq("customer_id", session.user.id)
    .maybeSingle();
  if (!booking || booking.booking_flow !== "hourly_v1") notFound();

  const service = Array.isArray(booking.service)
    ? booking.service[0]
    : booking.service;
  if (!service) notFound();

  // Alternatives surface for a timed-out request (past its response window), a
  // declined one, or one the provider cancelled — as long as the job itself
  // hasn't started. The RPCs re-check all of this; this drives the copy.
  const now = new Date();
  const timedOut =
    booking.status === "requested" &&
    booking.response_alert_at != null &&
    now >= new Date(booking.response_alert_at);
  const providerCancelled =
    booking.status === "cancelled" && booking.cancelled_by_role === "provider";
  const replacementAvailable =
    (timedOut || booking.status === "declined" || providerCancelled) &&
    now < new Date(booking.scheduled_at);

  // "This time only" — the suggestion RPC returns no time-shifted options for
  // these, so the empty state must explain why rather than imply scarcity.
  const fixedTime = booking.time_flexibility === "fixed";

  const pool = replacementAvailable
    ? await getReplacementPool(supabase, {
        id: booking.id,
        serviceSlug: service.slug,
      })
    : { exact: [], timeShift: [] };
  const candidates = [...pool.exact, ...pool.timeShift];

  // A preselection arriving from a dashboard card. Both halves are verified
  // against what the database actually offers: an unknown provider service is
  // ignored, and a start time nobody offered is dropped rather than honored.
  const preselected = ps
    ? candidates.find((candidate) => candidate.providerServiceId === ps)
    : undefined;
  const preselectedStartAt =
    preselected && at && isOfferedStartTime(pool, preselected.providerServiceId, at)
      ? at
      : undefined;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        title="Pick another student"
        description={`${service.name} · ${formatDateTime(booking.scheduled_at)}`}
      />

      {!replacementAvailable ? (
        <Card className="p-6 text-sm text-ink-soft">
          {booking.status === "requested"
            ? "Replacement suggestions appear if the provider has not responded by the deadline."
            : "This request can’t be replaced right now."}
        </Card>
      ) : candidates.length === 0 ? (
        <Card className="space-y-2 p-6 text-sm text-ink-soft">
          {pool.error ? (
            <p>{pool.error}</p>
          ) : fixedTime ? (
            // They asked for this time only, so we never offered anyone at a
            // different one. Say that plainly rather than implying nobody
            // exists — booking a new time is still open to them.
            <>
              <p>
                No other ready student is free at{" "}
                {formatDateTime(booking.scheduled_at)}.
              </p>
              <p>
                You asked for this time only, so we haven&apos;t suggested
                students who&apos;d need to move it. Browse the crew to book a
                different time.
              </p>
            </>
          ) : (
            <p>
              No other ready student currently fits this service — at your time
              or nearby. Try browsing the crew for a different day.
            </p>
          )}
        </Card>
      ) : (
        <ReplacementForm
          bookingId={booking.id}
          originalStartAt={booking.scheduled_at}
          candidates={candidates}
          preselectedProviderServiceId={preselected?.providerServiceId}
          preselectedStartAt={preselectedStartAt}
        />
      )}

      <div className="flex flex-wrap gap-2">
        <Link
          href="/dashboard"
          className={buttonClasses({ variant: "ghost", size: "sm" })}
        >
          ← Back to my bookings
        </Link>
        <Link
          href="/browse"
          className={buttonClasses({ variant: "ghost", size: "sm" })}
        >
          Browse the whole crew
        </Link>
      </div>
    </div>
  );
}
