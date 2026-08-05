import type { Service } from "@/lib/db/types";
import { PILOT_SERVICE_AREA, SITE_URL } from "@/lib/site";

/**
 * The subset of a service row this module needs. Kept structural so callers
 * can pass full `Service` rows without the tests having to build one.
 */
export type BrowseSeoService = Pick<Service, "name" | "slug">;

export type BrowseSeo = {
  title: string;
  description: string;
  canonical: string;
};

/**
 * Title, description, and canonical URL for `/browse`.
 *
 * `sort` is a view preference rather than content — `?service=hauling&sort=rating`
 * lists the same providers as `?service=hauling` — so it is deliberately absent
 * from the canonical. Left alone it tripled every browse URL and produced most
 * of the duplicate-title and duplicate-content flags in the 2026-08-04 Semrush
 * audit. `service` does change the content, so it stays.
 *
 * An unknown or absent slug falls back to the unfiltered page rather than
 * inventing a canonical for a URL that renders the full list anyway.
 */
export function browseSeo(
  services: readonly BrowseSeoService[],
  serviceSlug?: string,
): BrowseSeo {
  const active = serviceSlug
    ? services.find((service) => service.slug === serviceSlug)
    : undefined;

  if (!active) {
    return {
      title: "Browse providers",
      description: `Browse verified college students available for home and household jobs across ${PILOT_SERVICE_AREA.name}. Compare rates and reviews, then book online.`,
      canonical: `${SITE_URL}/browse`,
    };
  }

  return {
    title: `${active.name} providers`,
    description: `Hire a verified college student for ${active.name.toLowerCase()} in ${PILOT_SERVICE_AREA.name}. See rates and reviews from College Crew providers, then book online.`,
    canonical: `${SITE_URL}/browse?service=${active.slug}`,
  };
}
