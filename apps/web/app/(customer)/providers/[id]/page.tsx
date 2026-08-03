import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ProviderProfile } from "@/components/provider-profile";
import { getSession } from "@/lib/auth/session";
import { getPublicProviderProfile } from "@/lib/db/queries";
import {
  getBookingFrom,
  resolveBookingOrigin,
} from "@/lib/location/booking-from";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || "https://www.thecollegecrew.com";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const provider = await getPublicProviderProfile(id, null);
  if (!provider) return { title: "Provider not found" };

  const displayName = provider.company_name || provider.display_name;
  const primaryService = provider.services[0]?.service.name;
  const title = primaryService
    ? `${displayName} — ${primaryService} in ${provider.town} | College Crew`
    : `${displayName} | College Crew`;
  const description = provider.bio
    ? provider.bio.slice(0, 155)
    : `${displayName} offers ${provider.services.map((s) => s.service.name).join(", ") || "home services"} in ${provider.town} on College Crew.`;

  return {
    title,
    description,
    alternates: { canonical: `${SITE_URL}/providers/${id}` },
  };
}

export default async function ProviderProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [session, bookingFrom] = await Promise.all([
    getSession(),
    getBookingFrom(),
  ]);
  const origin = resolveBookingOrigin(bookingFrom, session?.profile ?? null);
  const provider = await getPublicProviderProfile(
    id,
    origin.isSet
      ? { latitude: origin.latitude, longitude: origin.longitude }
      : null,
  );

  if (!provider) notFound();

  const serviceSchema = {
    "@context": "https://schema.org",
    "@type": "Service",
    name: provider.company_name || provider.display_name,
    areaServed: provider.town,
    provider: {
      "@type": provider.provider_type === "business" ? "Organization" : "Person",
      name: provider.company_name || provider.display_name,
    },
    ...(provider.rating
      ? {
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: provider.rating.avg,
            reviewCount: provider.rating.count,
          },
        }
      : {}),
    offers: provider.services.map((offered) => ({
      "@type": "Offer",
      name: offered.service.name,
      priceCurrency: "USD",
      ...(offered.pricing_mode === "hourly" && offered.hourly_rate_cents != null
        ? { price: (offered.hourly_rate_cents / 100).toFixed(2) }
        : {}),
    })),
  };

  return (
    <div className="mx-auto max-w-3xl">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(serviceSchema).replace(/</g, "\\u003c"),
        }}
      />
      <ProviderProfile provider={provider} />
    </div>
  );
}
