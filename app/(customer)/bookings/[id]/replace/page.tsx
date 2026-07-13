import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { requireRole } from "@/lib/auth/session";
import { eligibleResponseWindowHours } from "@/lib/booking/policy";
import { getReplacementCandidateIds } from "@/lib/booking/requests";
import { getApprovedProviders } from "@/lib/db/queries";
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
  const replacementAvailable =
    booking.status === "requested" &&
    new Date() >= new Date(booking.response_alert_at!);

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
  const responseOptions = eligibleResponseWindowHours(
    new Date(),
    booking.scheduled_at,
  );

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        title="Find a replacement"
        description={`${service.name} · ${formatDateTime(booking.scheduled_at)}`}
      />

      {!replacementAvailable ? (
        <Card className="p-6 text-sm text-ink-soft">
          {booking.status === "requested"
            ? "Replacement suggestions appear if the provider has not responded by the selected deadline."
            : "This request is no longer open for replacement."}
        </Card>
      ) : candidates.length === 0 || responseOptions.length === 0 ? (
        <Card className="p-6 text-sm text-ink-soft">
          No other ready provider currently fits this exact service, time, and
          notice requirement. The original request remains open.
        </Card>
      ) : (
        <ReplacementForm
          bookingId={booking.id}
          candidates={candidates}
          responseOptions={[...responseOptions]}
        />
      )}

      <Link href="/dashboard" className={buttonClasses({ variant: "ghost", size: "sm" })}>
        ← Back to my bookings
      </Link>
    </div>
  );
}
