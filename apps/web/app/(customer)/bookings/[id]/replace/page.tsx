import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { requireRole } from "@/lib/auth/session";
import {
  isOfferedStartTime,
  type ReplacementSuggestion,
} from "@/lib/booking/replacement-ranking";
import { getReplacementPool } from "@/lib/booking/replacement-suggestions";
import {
  hasAcceptedCurrentLegalDocument,
  legalDocumentPath,
} from "@/lib/legal/acceptance";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime, formatMoney } from "@/lib/utils";

import { ReplacementForm } from "./replacement-form";

export const metadata: Metadata = { title: "Pick another student" };

/**
 * Everyone else who offers this service, with no slot promise attached. These
 * exist so the page is never a dead end while students remain: the customer
 * picks the time themselves on the other side of the link.
 */
function FallbackStudents({
  students,
  hasBookableOptions,
}: {
  students: ReplacementSuggestion[];
  hasBookableOptions: boolean;
}) {
  return (
    <section aria-label="Other students who offer this service" className="space-y-3">
      <div>
        <h2 className="font-display text-sm font-semibold text-ink">
          {hasBookableOptions
            ? "Everyone else who does this"
            : "Other students who do this"}
        </h2>
        <p className="mt-0.5 text-xs text-mist">
          No opening matched your job, so you&apos;d pick a new time with them
          directly.
        </p>
      </div>
      <ul className="space-y-2">
        {students.map((student) => (
          <li key={student.providerServiceId}>
            <Link
              href={
                student.payoutReady
                  ? `/book/${student.providerId}`
                  : `/providers/${student.providerId}`
              }
              className="flex items-center justify-between gap-3 rounded-xl border border-line bg-paper p-3 transition-colors hover:border-crew-600 hover:bg-crew-50"
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-ink">
                  {student.providerName}
                </span>
                <span className="mt-0.5 block text-xs text-mist">
                  {student.rating
                    ? `${student.rating.avg.toFixed(1)} ★ · ${student.rating.count} review${student.rating.count === 1 ? "" : "s"}`
                    : "New to the crew"}
                  {student.payoutReady ? "" : " · still finishing setup"}
                </span>
              </span>
              <span className="shrink-0 font-semibold text-quad-700">
                {formatMoney(student.hourlyRateCents)}/hr
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

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
    : { exact: [], timeShift: [], fallback: [] };
  // Only tiers 1 and 2 have a validated slot, so only they can go in the hold
  // form. Tier 3 renders below it as links — there is no slot to price.
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
        // No bookable slot. The fallback list below may still have students; a
        // truly empty page means nobody else offers this service at all.
        <Card className="space-y-2 p-6 text-sm text-ink-soft">
          {pool.error ? (
            <p>{pool.error}</p>
          ) : pool.fallback.length > 0 ? (
            <p>
              No one can take {service.name.toLowerCase()} at{" "}
              {formatDateTime(booking.scheduled_at)}
              {fixedTime
                ? ", and you asked for this time only."
                : " or at a nearby opening."}{" "}
              These students still offer it — you&apos;d agree a new time with
              them.
            </p>
          ) : (
            <p>
              No other student offers {service.name.toLowerCase()} right now. We
              won&apos;t suggest a different service — browse the crew to see
              what else is available.
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

      {/* Tier 3: no validated slot, so these sit outside the hold form and link
          to the student. Shown whenever they exist — if the form above is empty
          these are the only options left, and if it isn't they're still the
          rest of the crew for this service. */}
      {replacementAvailable && pool.fallback.length > 0 ? (
        <FallbackStudents
          students={pool.fallback}
          hasBookableOptions={candidates.length > 0}
        />
      ) : null}

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
