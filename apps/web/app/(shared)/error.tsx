"use client";

import { Button } from "@/components/ui/button";

export default function SharedErrorBoundary({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <div className="mx-auto flex max-w-md flex-1 flex-col items-center justify-center gap-4 px-4 py-24 text-center">
      <h1 className="font-display text-2xl font-semibold">
        Something went wrong
      </h1>
      <p className="text-sm text-ink-soft">
        {error.digest
          ? `We couldn’t load this page (ref ${error.digest}).`
          : "We couldn’t load this page."}{" "}
        Try again, and if it keeps happening let us know.
      </p>
      <Button onClick={unstable_retry}>Try again</Button>
    </div>
  );
}
