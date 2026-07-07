import type { Metadata } from "next";
import Link from "next/link";

import { buttonClasses } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";

export const metadata: Metadata = { title: "Blog" };

/**
 * Ships as an intentionally empty route for the pilot demo (SPEC §3);
 * content (local tips, student spotlights, seasonal checklists) comes later.
 */
export default function BlogPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <PageHeader
        title="Blog"
        description="Local tips, student spotlights, and seasonal checklists."
      />
      <EmptyState
        title="First post coming soon"
        action={
          <Link
            href="/browse"
            className={buttonClasses({ variant: "secondary", size: "sm" })}
          >
            Browse providers instead
          </Link>
        }
      >
        We&apos;re heads-down getting the pilot ready. Posts land here once
        the crew is up and running.
      </EmptyState>
    </div>
  );
}
