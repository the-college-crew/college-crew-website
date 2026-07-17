"use client";

import { Button } from "@/components/ui/button";

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="mx-auto flex max-w-md flex-1 flex-col items-center justify-center gap-4 px-4 py-24 text-center">
      <h1 className="font-display text-2xl font-semibold">
        Something went wrong
      </h1>
      <p className="text-sm text-ink-soft">
        {error.digest
          ? `An unexpected error occurred (ref ${error.digest}).`
          : "An unexpected error occurred."}{" "}
        Try again, and if it keeps happening let us know.
      </p>
      <Button onClick={reset}>Try again</Button>
    </main>
  );
}
