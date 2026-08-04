import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { BrowseControls } from "@/components/browse-controls";
import { Editable } from "@/components/content/editable";
import { ProviderCard } from "@/components/provider-card";
import { ServiceFilter } from "@/components/service-filter";
import { buttonClasses } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { getSession } from "@/lib/auth/session";
import {
  selectFeaturedOfferingIds,
  utcDateKey,
} from "@/lib/browse/ranking";
import {
  getApprovedProviders,
  getLiveServices,
  getServiceProviderCounts,
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
  const [services, session, bookingFrom, counts] = await Promise.all([
    getLiveServices(),
    getSession(),
    getBookingFrom(),
    getServiceProviderCounts(),
  ]);
  const sort: ProviderSort = ["location", "rating"].includes(sortParam ?? "")
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
  const featuredOfferingIds = selectFeaturedOfferingIds(providers, {
    activeServiceSlug: service,
    dateKey: utcDateKey(),
  });

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <span className="brand-eyebrow">
          {counts.total} verified provider{counts.total === 1 ? "" : "s"}{" "}
          nearby
        </span>
        <PageHeader
          title={<Editable k="browse.header.title">Browse the crew</Editable>}
          description={
            <Editable k="browse.header.description">
              Verified student providers in your neighborhood: businesses and
              individuals. Only ID-approved students are listed.
            </Editable>
          }
          back={false}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-10 gap-y-4 border-b border-line pb-5">
        <ServiceFilter
          services={services}
          activeSlug={service}
          preserveParams={{ sort: sort === "suggested" ? undefined : sort }}
          counts={counts}
        />
        <BrowseControls
          activeSort={sort}
          serviceSlug={service}
          bookingFrom={buildBookingFromSummary(
            bookingFrom,
            session?.profile ?? null,
          )}
        />
      </div>

      {providers.length === 0 ? (
        <div className="mx-auto max-w-xl">
          <EmptyState
            title={
              <Editable k="browse.empty.title">No providers yet</Editable>
            }
            action={
              !session ? (
                <Link
                  href="/provider/onboarding"
                  className={buttonClasses({
                    variant: "secondary",
                    size: "sm",
                  })}
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
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 items-stretch gap-6 md:grid-cols-2 xl:grid-cols-3">
            {providers.map((provider) => (
              // Same scroll-driven rise-in the landing sections use; static
              // fallback for reduced motion and older browsers (globals.css).
              // h-full lets the card fill the stretched grid track so every
              // card in a row ends at the same bottom edge.
              <div key={provider.id} className="reveal-rise h-full">
                <ProviderCard
                  provider={provider}
                  featuredOfferingId={featuredOfferingIds.get(provider.id)}
                />
              </div>
            ))}
          </div>
          {!session ? <JoinCrewBand /> : null}
        </>
      )}
    </div>
  );
}

/**
 * Closes the roster for logged-out visitors the way the homepage's CTA band
 * closes the landing page: same viridian surface, seal watermark, and
 * "Become a provider" label, scaled down to the browse column.
 */
function JoinCrewBand() {
  return (
    <section className="relative mt-10 overflow-hidden rounded-2xl bg-viridian px-6 py-10 text-shell sm:px-10">
      <Image
        src="/college-crew-logo.png"
        alt=""
        width={520}
        height={520}
        aria-hidden
        className="pointer-events-none absolute -bottom-20 -right-16 z-0 w-64 max-w-none rotate-[14deg] opacity-15"
      />
      <div className="relative z-10 max-w-md">
        <h2 className="text-balance font-display text-2xl font-semibold leading-tight tracking-[-0.02em] md:text-[28px]">
          <Editable k="browse.join.heading">
            Students, this list has room for you.
          </Editable>
        </h2>
        <p className="mt-3 text-[15px] leading-relaxed text-shell/80">
          <Editable k="browse.join.body">
            Get ID-verified, set your services and rates, and start building a
            reputation a few streets from home.
          </Editable>
        </p>
        <Link
          href="/provider/onboarding"
          className="mt-6 inline-flex items-center justify-center rounded-full border-[1.6px] border-shell bg-shell px-[26px] py-[13px] text-base font-semibold text-viridian transition duration-200 hover:-translate-y-px hover:bg-[#e7e4dc] active:translate-y-0 active:scale-[0.98]"
        >
          Become a provider
        </Link>
      </div>
    </section>
  );
}
