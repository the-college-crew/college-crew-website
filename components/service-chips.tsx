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
}: {
  services: Service[];
  activeSlug?: string;
  basePath?: string;
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
      <Link href={basePath} className={chip(!activeSlug)}>
        All services
      </Link>
      {services.map((service) => (
        <Link
          key={service.id}
          href={`${basePath}?service=${service.slug}`}
          className={chip(activeSlug === service.slug)}
        >
          {service.name}
        </Link>
      ))}
    </nav>
  );
}
