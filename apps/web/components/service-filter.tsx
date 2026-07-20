"use client";

import { useRouter } from "next/navigation";

import type { ServiceProviderCounts } from "@/lib/db/queries";
import type { Service } from "@/lib/db/types";

/**
 * Service filter as a single select rather than a wall of chips — with ~10
 * services this reads far cleaner (see taste-skill guidance on long lists:
 * past ~5 items, reach for a select/tabs/accordion instead of more chips).
 * Still fully URL-driven: no client state beyond the pending navigation.
 */
export function ServiceFilter({
  services,
  activeSlug,
  basePath = "/browse",
  preserveParams,
  counts,
}: {
  services: Service[];
  activeSlug?: string;
  basePath?: string;
  preserveParams?: Record<string, string | undefined>;
  /** Provider counts per option; omit to render plain labels. */
  counts?: ServiceProviderCounts;
}) {
  const router = useRouter();

  function handleChange(event: React.ChangeEvent<HTMLSelectElement>) {
    const slug = event.target.value;
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(preserveParams ?? {})) {
      if (value) params.set(key, value);
    }
    if (slug) params.set("service", slug);
    const query = params.toString();
    router.push(query ? `${basePath}?${query}` : basePath);
  }

  return (
    <div className="flex items-center gap-2.5">
      <label
        htmlFor="browse-service-filter"
        className="text-sm font-medium text-ink"
      >
        Service
      </label>
      <select
        id="browse-service-filter"
        aria-label="Filter by service"
        value={activeSlug ?? ""}
        onChange={handleChange}
        className="brand-select rounded-lg border border-line bg-paper py-2 pl-3.5 pr-9 text-sm font-medium text-ink-soft transition-colors hover:border-viridian/30"
      >
        <option value="">
          All services{counts ? ` (${counts.total})` : ""}
        </option>
        {services.map((service) => (
          <option key={service.id} value={service.slug}>
            {service.name}
            {counts ? ` (${counts.bySlug[service.slug] ?? 0})` : ""}
          </option>
        ))}
      </select>
    </div>
  );
}
