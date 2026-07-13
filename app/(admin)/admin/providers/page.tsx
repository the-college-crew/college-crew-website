import type { Metadata } from "next";

import { PageHeader } from "@/components/ui/page-header";
import { RealtimeRefresh } from "@/components/realtime-refresh";
import { requireRole } from "@/lib/auth/session";
import type { ProviderProfile } from "@/lib/db/types";
import { getOfferingReadiness } from "@/lib/provider/setup";
import { createAdminClient } from "@/lib/supabase/admin";

import {
  ProvidersManager,
  type ProviderRow,
  type ServiceOption,
} from "./providers-manager";

export const metadata: Metadata = { title: "Provider approvals" };

type Row = ProviderProfile & {
  user: { full_name: string } | null;
  provider_services: Array<{
    hourly_rate_cents: number | null;
    service: { slug: string; is_live: boolean } | null;
  }>;
};

export default async function AdminProvidersPage({
  searchParams,
}: {
  searchParams: Promise<{ err?: string }>;
}) {
  await requireRole("admin");
  const { err } = await searchParams;

  // Private provider fields are never browser-role readable. This page performs
  // an explicit role check before using the server-only administrative client.
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("provider_profiles")
    .select(
      "*, user:profiles(full_name), provider_services(hourly_rate_cents, service:services(slug, is_live))",
    )
    .order("created_at", { ascending: true });

  // Verified school (.edu) emails, keyed by user (no direct FK to join on).
  const { data: schoolRows } = await supabase
    .from("provider_school_emails")
    .select("user_id, email");
  const schoolByUser = new Map(
    (schoolRows ?? []).map((r) => [r.user_id, r.email]),
  );

  // Live services power the filter chips; slugs match against each row.
  const { data: services } = await supabase
    .from("services")
    .select("slug, name")
    .eq("is_live", true)
    .order("name");
  const serviceOptions: ServiceOption[] = (services ?? []).map((s) => ({
    slug: s.slug,
    name: s.name,
  }));

  const providers = (data ?? []) as Row[];
  const rows: ProviderRow[] = providers.map((p) => ({
    id: p.id,
    displayName: p.display_name,
    fullName: p.user?.full_name ?? null,
    status: p.verification_status,
    createdAt: p.created_at,
    // A complete license means both sides — that's what unlocks review.
    hasLicense: Boolean(p.id_document_url && p.id_document_back_url),
    hasSchoolEmail: schoolByUser.has(p.user_id),
    serviceCount: p.provider_services.length,
    bookingReady: p.provider_services.some(
      (offering) =>
        offering.service &&
        getOfferingReadiness(p, {
          hourly_rate_cents: offering.hourly_rate_cents,
          service_is_live: offering.service.is_live,
        }).bookable,
    ),
    serviceSlugs: Array.from(
      new Set(
        p.provider_services
          .map((ps) => ps.service?.slug)
          .filter((slug): slug is string => Boolean(slug)),
      ),
    ),
  }));

  return (
    <div className="space-y-8">
      {/* New signups, ID uploads, and school-email verifications all move a
          provider between stages/tabs — listen to both feeding tables. */}
      <RealtimeRefresh channel="admin-providers" table="provider_profiles" />
      <RealtimeRefresh
        channel="admin-school-emails"
        table="provider_school_emails"
      />
      <PageHeader
        title="Provider approvals"
        description="Review driver's licenses by hand, filter by service, and clean up profiles. Approving flips the provider live in Browse and unlocks their Stripe connection."
      />

      {err === "env" ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          SUPABASE_SERVICE_ROLE_KEY is missing — approvals need it. Add it to
          .env.local.
        </div>
      ) : null}

      {err === "unverified" ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          That provider hasn&apos;t verified a school (.edu) email yet — they
          can&apos;t be approved until they do.
        </div>
      ) : null}

      <ProvidersManager rows={rows} serviceOptions={serviceOptions} />
    </div>
  );
}
