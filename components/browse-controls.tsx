import Link from "next/link";

import { BookingFrom } from "@/components/booking-from";
import { buttonClasses } from "@/components/ui/button";
import type { ProviderSort } from "@/lib/db/queries";
import type { BookingFromSummary } from "@/lib/location/booking-from";
import { cn } from "@/lib/utils";

const SORTS: Array<{ value: ProviderSort; label: string }> = [
  { value: "suggested", label: "Suggested" },
  { value: "location", label: "Location" },
  { value: "rating", label: "Rating" },
  { value: "rate", label: "Hourly rate" },
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
    <div className="grid gap-4 rounded-2xl border-[1.4px] border-viridian/15 bg-court p-4 sm:grid-cols-[1fr_auto] sm:items-center">
      <BookingFrom summary={bookingFrom} />

      <nav aria-label="Sort providers" className="flex flex-wrap gap-2">
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
                buttonClasses({
                  variant: active ? "primary" : "secondary",
                  size: "sm",
                }),
                !active && "border-viridian/20",
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
