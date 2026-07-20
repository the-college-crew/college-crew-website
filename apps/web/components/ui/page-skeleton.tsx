import { cn } from "@/lib/utils";

/** Quiet route-level placeholder that preserves the page's visual rhythm. */
export function PageSkeleton({
  cards = 3,
  className,
}: {
  cards?: number;
  className?: string;
}) {
  return (
    <div
      aria-busy="true"
      aria-label="Loading page"
      className={cn("space-y-6", className)}
    >
      <div className="space-y-2">
        <div className="h-8 w-52 animate-pulse rounded-lg bg-stone motion-reduce:animate-none" />
        <div className="h-4 w-full max-w-md animate-pulse rounded bg-stone/75 motion-reduce:animate-none" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: cards }, (_, index) => (
          <div
            key={index}
            className="space-y-3 rounded-2xl border border-line bg-paper p-5"
          >
            <div className="h-5 w-2/3 animate-pulse rounded bg-stone motion-reduce:animate-none" />
            <div className="h-4 w-full animate-pulse rounded bg-stone/75 motion-reduce:animate-none" />
            <div className="h-4 w-4/5 animate-pulse rounded bg-stone/75 motion-reduce:animate-none" />
          </div>
        ))}
      </div>
      <span className="sr-only">Loading…</span>
    </div>
  );
}
