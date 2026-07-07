import type { Metadata } from "next";
import Link from "next/link";

import { ProviderCard } from "@/components/provider-card";
import { ServiceChips } from "@/components/service-chips";
import { buttonClasses } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { getSession } from "@/lib/auth/session";
import { getApprovedProviders, getLiveServices } from "@/lib/db/queries";

export const metadata: Metadata = { title: "Browse providers" };

export default async function BrowsePage({
  searchParams,
}: {
  searchParams: Promise<{ service?: string }>;
}) {
  const { service } = await searchParams;
  const [services, providers, session] = await Promise.all([
    getLiveServices(),
    getApprovedProviders(service),
    getSession(),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Browse the crew"
        description="Verified student providers in your neighborhood — businesses and individuals. Only ID-approved students are listed."
      />

      <ServiceChips services={services} activeSlug={service} />

      {providers.length === 0 ? (
        <EmptyState
          title="No providers yet"
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
          {service
            ? "Nobody offers this service yet — try another filter, or check back soon."
            : "Approved providers will appear here as the crew grows."}
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
