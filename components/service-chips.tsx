import Link from "next/link";

import type { Service } from "@/lib/db/types";
import { cn } from "@/lib/utils";

/**
 * Service filter chips (Browse). Server-rendered links driven by the
 * `service` search param — no client state, shareable URLs.
 */
export function ServiceChips({
  services,
  activeSlug,
  basePath = "/browse",
  preserveParams,
}: {
  services: Service[];
  activeSlug?: string;
  basePath?: string;
  preserveParams?: Record<string, string | undefined>;
}) {
  const chip = (active: boolean) =>
    cn(
      "rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
      active
        ? "border-crew-600 bg-crew-600 text-white"
        : "border-line bg-paper text-ink-soft hover:border-crew-400 hover:text-crew-700",
    );

  return (
    <nav aria-label="Filter by service" className="flex flex-wrap gap-2">
      <Link
        href={buildHref(basePath, undefined, preserveParams)}
        className={chip(!activeSlug)}
      >
        All services
      </Link>
      {services.map((service) => (
        <Link
          key={service.id}
          href={buildHref(basePath, service.slug, preserveParams)}
          className={chip(activeSlug === service.slug)}
        >
          {service.name}
        </Link>
      ))}
    </nav>
  );
}

function buildHref(
  basePath: string,
  serviceSlug?: string,
  preserveParams?: Record<string, string | undefined>,
) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(preserveParams ?? {})) {
    if (value) params.set(key, value);
  }
  if (serviceSlug) params.set("service", serviceSlug);
  const query = params.toString();
  return query ? `${basePath}?${query}` : basePath;
}
