import Link from "next/link";

import { buttonClasses } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="mx-auto flex max-w-md flex-1 flex-col items-center justify-center gap-4 px-4 py-24 text-center">
      <p className="font-display text-6xl font-bold uppercase text-crew-200">
        404
      </p>
      <h1 className="font-display text-2xl font-semibold">
        Page not found
      </h1>
      <p className="text-sm text-ink-soft">
        The page you&apos;re looking for doesn&apos;t exist or has moved.
      </p>
      <Link href="/" className={buttonClasses({ variant: "primary" })}>
        Back to home
      </Link>
    </main>
  );
}
