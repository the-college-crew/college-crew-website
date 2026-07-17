"use client";

import Link from "next/link";
import { ViewTransition } from "react";

import type { ServiceProviderCounts } from "@/lib/db/queries";
import type { Service } from "@/lib/db/types";
import { cn } from "@/lib/utils";

/**
 * Service filter chips (Browse). Links driven by the `service` search param —
 * no client state, shareable URLs. A client component only so the active
 * pill's <ViewTransition> glides between chips when the filter changes
 * (same experimental.viewTransition setup as the provider-card morph).
 */
export function ServiceChips({
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
  /** Provider counts per chip; omit to render label-only chips. */
  counts?: ServiceProviderCounts;
}) {
  return (
    <nav aria-label="Filter by service" className="flex flex-wrap gap-2">
      <Chip
        href={buildHref(basePath, undefined, preserveParams)}
        active={!activeSlug}
        label="All services"
        count={counts?.total}
      />
      {services.map((service) => (
        <Chip
          key={service.id}
          href={buildHref(basePath, service.slug, preserveParams)}
          active={activeSlug === service.slug}
          label={service.name}
          count={counts ? (counts.bySlug[service.slug] ?? 0) : undefined}
        />
      ))}
    </nav>
  );
}

function Chip({
  href,
  active,
  label,
  count,
}: {
  href: string;
  active: boolean;
  label: string;
  count?: number;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
        active
          ? "border-transparent text-white"
          : "border-line bg-paper text-ink-soft hover:border-crew-400 hover:text-crew-700",
      )}
    >
      {active ? (
        // The filled pill is its own layer so the view transition can morph
        // it from the previously active chip to this one on navigation.
        <ViewTransition name="browse-active-chip">
          <span
            aria-hidden
            className="absolute -inset-px rounded-full bg-crew-600"
          />
        </ViewTransition>
      ) : null}
      <span className="relative">
        {label}
        {count !== undefined ? (
          <span
            className={cn(
              "ml-1.5 tabular-nums font-normal",
              active ? "text-white/70" : "text-mist",
            )}
          >
            {count}
          </span>
        ) : null}
      </span>
    </Link>
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
