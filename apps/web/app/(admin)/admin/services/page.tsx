import type { Metadata } from "next";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { PageHeader } from "@/components/ui/page-header";
import { createClient } from "@/lib/supabase/server";

import { toggleServiceLive } from "../actions";

export const metadata: Metadata = { title: "Service curation" };

/**
 * Curated catalog control (SPEC §8): what's live here is what customers can
 * browse and providers can offer. The UI never hard-codes services.
 */
export default async function AdminServicesPage({
  searchParams,
}: {
  searchParams: Promise<{ err?: string }>;
}) {
  const { err } = await searchParams;

  const supabase = await createClient();
  const { data: services } = await supabase
    .from("services")
    .select("*")
    .order("name");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Service curation"
        description="Toggle which services are live platform-wide. Hidden services disappear from Browse and onboarding, but existing bookings keep their history."
      />

      {err === "env" ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          SUPABASE_SERVICE_ROLE_KEY is missing — curation needs it. Add it to
          .env.local.
        </div>
      ) : null}

      <Card className="divide-y divide-line p-0">
        {!services || services.length === 0 ? (
          <p className="p-4 text-sm text-mist">
            No services in the catalog — the seed migration adds the launch
            six.
          </p>
        ) : (
          services.map((service) => (
            <div
              key={service.id}
              className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
            >
              <div>
                <p className="text-sm font-semibold">{service.name}</p>
                <p className="text-xs text-mist">
                  {service.category} · /{service.slug}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Badge tone={service.is_live ? "green" : "gray"}>
                  {service.is_live ? "Live" : "Hidden"}
                </Badge>
                <form action={toggleServiceLive}>
                  <input type="hidden" name="serviceId" value={service.id} />
                  <input
                    type="hidden"
                    name="nextLive"
                    value={String(!service.is_live)}
                  />
                  <ConfirmSubmitButton
                    type="submit"
                    variant="secondary"
                    size="sm"
                    confirmMessage={
                      service.is_live
                        ? `Hide ${service.name}? Customers and providers will no longer see it for new bookings.`
                        : undefined
                    }
                  >
                    {service.is_live ? "Hide" : "Go live"}
                  </ConfirmSubmitButton>
                </form>
              </div>
            </div>
          ))
        )}
      </Card>
    </div>
  );
}
