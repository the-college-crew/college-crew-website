import type { Metadata } from "next";
import Link from "next/link";

import { buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export const metadata: Metadata = { title: "Account deleted" };

export default function GoodbyePage() {
  return (
    <div className="mx-auto w-full max-w-lg px-4 py-16">
      <Card className="p-8 text-center">
        <h1 className="font-display text-2xl font-semibold uppercase tracking-wide text-ink">
          Your account has been deleted
        </h1>
        <p className="mt-3 text-sm text-ink-soft">
          Your College Crew account and all of its data have been permanently
          removed. Thanks for giving us a try — you&apos;re always welcome back.
        </p>
        <div className="mt-6">
          <Link href="/" className={buttonClasses({ variant: "primary" })}>
            Back to home
          </Link>
        </div>
      </Card>
    </div>
  );
}
