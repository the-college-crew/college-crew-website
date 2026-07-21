import Link from "next/link";

import { BookingFrom } from "@/components/booking-from";
import type { ProviderSort } from "@/lib/db/queries";
import type { BookingFromSummary } from "@/lib/location/booking-from";
import { cn } from "@/lib/utils";

const SORTS: Array<{ value: ProviderSort; label: string }> = [
  { value: "suggested", label: "Suggested" },
  { value: "location", label: "Location" },
  { value: "rating", label: "Rating" },
];

export function BrowseControls({
  activeSort,
  serviceSlug,
  bookingFrom,
}: {
  activeSort: ProviderSort;
  serviceSlug?: string;
  bookingFrom: BookingFromSummary;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
      <BookingFrom summary={bookingFrom} />

      {/* Underline tabs, same gold-accent treatment as the header's active
          nav link — text-weight sorting controls, not another row of pills. */}
      <nav
        aria-label="Sort providers"
        className="flex items-center gap-5 text-sm font-medium"
      >
        <span className="text-ink-soft/70">Sort</span>
        {SORTS.map((sort) => {
          const params = new URLSearchParams();
          if (serviceSlug) params.set("service", serviceSlug);
          if (sort.value !== "suggested") params.set("sort", sort.value);
          const query = params.toString();
          const active = activeSort === sort.value;
          return (
            <Link
              key={sort.value}
              href={query ? `/browse?${query}` : "/browse"}
              aria-current={active ? "page" : undefined}
              className={cn(
                "transition-colors",
                active
                  ? "text-viridian underline decoration-gold-400 decoration-[2.5px] underline-offset-[6px]"
                  : "text-ink-soft hover:text-viridian",
              )}
            >
              {sort.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
