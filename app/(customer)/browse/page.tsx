import type { Metadata } from "next";
import Link from "next/link";

import { BrowseControls } from "@/components/browse-controls";
import { Editable } from "@/components/content/editable";
import { ProviderCard } from "@/components/provider-card";
import { ServiceChips } from "@/components/service-chips";
import { buttonClasses } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { getSession } from "@/lib/auth/session";
import {
  getApprovedProviders,
  getLiveServices,
  type ProviderSort,
} from "@/lib/db/queries";
import {
  buildBookingFromSummary,
  getBookingFrom,
  resolveBookingOrigin,
} from "@/lib/location/booking-from";

export const metadata: Metadata = { title: "Browse providers" };

export default async function BrowsePage({
  searchParams,
}: {
  searchParams: Promise<{ service?: string; sort?: string }>;
}) {
  const { service, sort: sortParam } = await searchParams;
  const [services, session, bookingFrom] = await Promise.all([
    getLiveServices(),
    getSession(),
    getBookingFrom(),
  ]);
  const sort: ProviderSort = ["location", "rating", "rate"].includes(
    sortParam ?? "",
  )
    ? (sortParam as ProviderSort)
    : "suggested";
  const origin = resolveBookingOrigin(bookingFrom, session?.profile ?? null);
  const providers = await getApprovedProviders({
    serviceSlug: service,
    sort,
    jobZip: origin.zip || undefined,
    origin: origin.isSet
      ? { latitude: origin.latitude, longitude: origin.longitude }
      : null,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title={<Editable k="browse.header.title">Browse the crew</Editable>}
        description={
          <Editable k="browse.header.description">
            Verified student providers in your neighborhood: businesses and
            individuals. Only ID-approved students are listed.
          </Editable>
        }
      />

      <ServiceChips
        services={services}
        activeSlug={service}
        preserveParams={{ sort: sort === "suggested" ? undefined : sort }}
      />
      <BrowseControls
        activeSort={sort}
        serviceSlug={service}
        bookingFrom={buildBookingFromSummary(bookingFrom, session?.profile ?? null)}
      />

      {providers.length === 0 ? (
        <EmptyState
          title={<Editable k="browse.empty.title">No providers yet</Editable>}
          action={
            !session ? (
              <Link
                href="/provider/onboarding/account"
                className={buttonClasses({ variant: "secondary", size: "sm" })}
              >
                Become a provider
              </Link>
            ) : undefined
          }
        >
          {service ? (
            <Editable k="browse.empty.filtered">
              Nobody offers this service yet. Try another filter, or check
              back soon.
            </Editable>
          ) : (
            <Editable k="browse.empty.default">
              Approved providers will appear here as the crew grows.
            </Editable>
          )}
        </EmptyState>
      ) : (
        <div className="mx-auto max-w-3xl space-y-4">
          {providers.map((provider) => (
            <ProviderCard key={provider.id} provider={provider} />
          ))}
        </div>
      )}
    </div>
  );
}
