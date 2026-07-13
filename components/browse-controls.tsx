import Link from "next/link";

import { setBrowseZip } from "@/app/(customer)/browse/actions";
import { Button, buttonClasses } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/field";
import type { ProviderSort } from "@/lib/db/queries";
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
  jobZip,
}: {
  activeSort: ProviderSort;
  serviceSlug?: string;
  jobZip?: string;
}) {
  return (
    <div className="grid gap-4 rounded-2xl border border-line bg-court p-4 sm:grid-cols-[1fr_auto] sm:items-end">
      <form action={setBrowseZip} className="flex items-end gap-2">
        <div className="max-w-44 flex-1">
          <Label htmlFor="browseJobZip">Job ZIP</Label>
          <Input
            id="browseJobZip"
            name="jobZip"
            inputMode="numeric"
            autoComplete="postal-code"
            pattern="[0-9]{5}"
            maxLength={5}
            defaultValue={jobZip}
            placeholder="60614"
            required
          />
        </div>
        <Button type="submit" variant="secondary" size="sm">
          Use ZIP
        </Button>
      </form>

      <nav aria-label="Sort providers" className="flex flex-wrap gap-2">
        {SORTS.map((sort) => {
          const params = new URLSearchParams();
          if (serviceSlug) params.set("service", serviceSlug);
          if (sort.value !== "suggested") params.set("sort", sort.value);
          const query = params.toString();
          return (
            <Link
              key={sort.value}
              href={query ? `/browse?${query}` : "/browse"}
              aria-current={activeSort === sort.value ? "page" : undefined}
              className={cn(
                buttonClasses({ variant: "ghost", size: "sm" }),
                activeSort === sort.value && "bg-crew-600 text-white hover:bg-crew-700",
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
