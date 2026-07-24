import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { requireRole } from "@/lib/auth/session";
import { getReplacementCandidateIds } from "@/lib/booking/requests";
import { getApprovedProviders } from "@/lib/db/queries";
import {
  hasAcceptedCurrentLegalDocument,
  legalDocumentPath,
} from "@/lib/legal/acceptance";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/utils";

import {
  ReplacementForm,
  type ReplacementCandidate,
} from "./replacement-form";

export const metadata: Metadata = { title: "Find a replacement" };

export default async function ReplacementPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [{ id }, session] = await Promise.all([
    params,
    requireRole("customer", "/dashboard"),
  ]);
  const supabase = await createClient();
  if (
    !(await hasAcceptedCurrentLegalDocument(supabase, {
      userId: session.user.id,
      kind: "customer_booking_terms",
    }))
  ) {
    redirect(
      legalDocumentPath(
        "customer_booking_terms",
        `/bookings/${id}/replace`,
      ),
    );
  }
  const { data: booking } = await supabase
    .from("bookings")
    .select(
      "id, booking_flow, status, scheduled_at, response_alert_at, service:services(name, slug)",
    )
    .eq("id", id)
    .eq("customer_id", session.user.id)
    .maybeSingle();
  if (!booking || booking.booking_flow !== "hourly_v1") notFound();

  const service = Array.isArray(booking.service) ? booking.service[0] : booking.service;
  if (!service) notFound();
  // Alternatives surface for a timed-out request (past its response window) or a
  // declined one, as long as the job itself hasn't started.
  const now = new Date();
  const timedOut =
    booking.status === "requested" &&
    booking.response_alert_at != null &&
    now >= new Date(booking.response_alert_at);
  const replacementAvailable =
    (timedOut || booking.status === "declined") &&
    now < new Date(booking.scheduled_at);

  let candidates: ReplacementCandidate[] = [];
  if (replacementAvailable) {
    const candidateIds = await getReplacementCandidateIds(supabase, booking.id);
    const providers = await getApprovedProviders({ serviceSlug: service.slug });
    const providersById = new Map(providers.map((provider) => [provider.id, provider]));
    candidates = candidateIds.flatMap((candidate) => {
      const provider = providersById.get(candidate.provider_id);
      const offering = provider?.services.find(
        (item) => item.id === candidate.provider_service_id,
      );
      if (!provider || offering?.hourly_rate_cents == null) return [];
      return [
        {
          providerServiceId: offering.id,
          providerId: provider.id,
          providerName: provider.display_name,
          hourlyRateCents: offering.hourly_rate_cents,
          rating: provider.rating,
        },
      ];
    });
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        title="Find a replacement"
        description={`${service.name} · ${formatDateTime(booking.scheduled_at)}`}
      />

      {!replacementAvailable ? (
        <Card className="p-6 text-sm text-ink-soft">
          {booking.status === "requested"
            ? "Replacement suggestions appear if the provider has not responded by the deadline."
            : "This request can’t be replaced right now."}
        </Card>
      ) : candidates.length === 0 ? (
        <Card className="p-6 text-sm text-ink-soft">
          No other ready provider currently fits this exact service, time, and
          notice requirement.
        </Card>
      ) : (
        <ReplacementForm bookingId={booking.id} candidates={candidates} />
      )}

      <Link href="/dashboard" className={buttonClasses({ variant: "ghost", size: "sm" })}>
        ← Back to my bookings
      </Link>
    </div>
  );
}
