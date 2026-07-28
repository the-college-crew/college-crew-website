import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { BookingCopyProvider } from "@/components/content/booking-copy-provider";
import { buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { requireRole } from "@/lib/auth/session";
import {
  bookingCopyValue,
  type BookingCopyOverrides,
} from "@/lib/content/booking-copy";
import { getBookingCopyOverrides } from "@/lib/content/booking-copy.server";
import { getProviderSchedule } from "@/lib/db/queries";
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
import type { QuoteDaypart } from "@/lib/booking/quote-dayparts";
import { formatDateTime, formatLocalDate, formatMoney } from "@/lib/utils";

import {
  QuoteReplacementForm,
  ReplacementForm,
} from "./replacement-form";

export const metadata: Metadata = { title: "Pick another student" };

/**
 * Everyone else who offers this service, with no slot promise attached. These
 * exist so the page is never a dead end while students remain: the customer
 * picks the time themselves on the other side of the link.
 */
function FallbackStudents({
  students,
  hasBookableOptions,
  copyOverrides,
}: {
  students: ReplacementSuggestion[];
  hasBookableOptions: boolean;
  copyOverrides: BookingCopyOverrides;
}) {
  const copy = (
    key: Parameters<typeof bookingCopyValue>[1],
    values?: Record<string, string | number>,
  ) => bookingCopyValue(copyOverrides, key, values);
  return (
    <section aria-label="Other students who offer this service" className="space-y-3">
      <div>
        <h2 className="font-display text-sm font-semibold text-ink">
          {hasBookableOptions
            ? "Everyone else who does this"
            : copy("booking-customer.replace.other-students")}
        </h2>
        <p className="mt-0.5 text-xs text-mist">
          {copy("booking-customer.replace.fallback-note")}
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
  const [{ id }, { ps, at }, session, copyOverrides] = await Promise.all([
    params,
    searchParams,
    requireRole("customer", "/dashboard"),
    getBookingCopyOverrides("customer"),
  ]);
  const copy = (
    key: Parameters<typeof bookingCopyValue>[1],
    values?: Record<string, string | number>,
  ) => bookingCopyValue(copyOverrides, key, values);
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
       provider_id, service_id, requested_local_date, requested_daypart,
       cancelled_by_role, estimated_minutes, time_flexibility,
       service:services(name, slug)`,
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

  const service = Array.isArray(booking.service)
    ? booking.service[0]
    : booking.service;
  if (!service) notFound();

  if (booking.booking_flow === "quote_v2") {
    const providerCancelled =
      booking.status === "cancelled" &&
      booking.cancelled_by_role === "provider";
    const replacementAvailable =
      booking.status === "declined" ||
      booking.status === "expired" ||
      booking.status === "withdrawn" ||
      providerCancelled;
    const { data: offerings } = replacementAvailable
      ? await supabase
          .from("public_provider_offerings")
          .select(
            "provider_service_id, provider_id, average_quote_cents, is_quote_bookable",
          )
          .eq("service_id", booking.service_id)
          .eq("pricing_mode", "quote")
          .neq("provider_id", booking.provider_id)
          .eq("is_quote_bookable", true)
      : { data: [] };
    const providerIds = (offerings ?? []).map((row) => row.provider_id);
    const { data: providers } = providerIds.length
      ? await supabase
          .from("public_provider_directory")
          .select("provider_id, display_name, minimum_notice_hours")
          .in("provider_id", providerIds)
      : { data: [] };
    const names = new Map(
      (providers ?? []).map((provider) => [
        provider.provider_id,
        provider.display_name ?? "Student provider",
      ]),
    );
    const providerDetails = new Map(
      (providers ?? []).map((provider) => [provider.provider_id, provider]),
    );
    const candidates = await Promise.all(
      (offerings ?? []).flatMap((offering) =>
        offering.provider_service_id
          && offering.provider_id
          ? [
              getProviderSchedule(offering.provider_id).then((schedule) => ({
                providerServiceId: offering.provider_service_id!,
                providerName:
                  names.get(offering.provider_id) ?? "Student provider",
                averageQuoteCents: offering.average_quote_cents,
                minimumNoticeHours:
                  providerDetails.get(offering.provider_id)
                    ?.minimum_notice_hours ?? 12,
                schedule,
              })),
            ]
          : [],
      ),
    );
    if (!booking.requested_local_date || !booking.requested_daypart) notFound();
    return (
      <BookingCopyProvider overrides={copyOverrides}>
        <div className="mx-auto max-w-2xl space-y-6">
          <PageHeader
            title="Pick another student"
            description={`${service.name} · ${formatLocalDate(booking.requested_local_date)}`}
          />
          {!replacementAvailable ? (
            <Card className="p-6 text-sm text-ink-soft">
              A replacement becomes available after the provider declines,
              misses the two-hour response window, or cancels.
            </Card>
          ) : candidates.length ? (
            <QuoteReplacementForm
              bookingId={booking.id}
              originalRequestedDate={booking.requested_local_date}
              originalRequestedDaypart={
                booking.requested_daypart as QuoteDaypart
              }
              candidates={candidates}
            />
          ) : (
            <Card className="p-6 text-sm text-ink-soft">
              No other quote provider is ready for this service right now.
            </Card>
          )}
          <Link
            href="/dashboard"
            className={buttonClasses({ variant: "ghost", size: "sm" })}
          >
            ← Back to my bookings
          </Link>
        </div>
      </BookingCopyProvider>
    );
  }

  if (!booking.scheduled_at) notFound();

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
    <BookingCopyProvider overrides={copyOverrides}>
      <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        title={copy("booking-customer.replace.title")}
        description={`${service.name} · ${formatDateTime(booking.scheduled_at)}`}
      />

      {!replacementAvailable ? (
        <Card className="p-6 text-sm text-ink-soft">
          {booking.status === "requested"
            ? copy("booking-customer.replace.waiting")
            : copy("booking-customer.replace.unavailable")}
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
          copyOverrides={copyOverrides}
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
    </BookingCopyProvider>
  );
}
