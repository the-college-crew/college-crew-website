import type { Metadata } from "next";
import Link from "next/link";

import { Editable } from "@/components/content/editable";
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
        title={<Editable k="blog.header.title">Blog</Editable>}
        description={
          <Editable k="blog.header.description">
            Local tips, student spotlights, and seasonal checklists.
          </Editable>
        }
      />
      <EmptyState
        title={
          <Editable k="blog.empty.title">First post coming soon</Editable>
        }
        action={
          <Link
            href="/browse"
            className={buttonClasses({ variant: "secondary", size: "sm" })}
          >
            Browse providers instead
          </Link>
        }
      >
        <Editable k="blog.empty.body">
          {`We're heads-down getting the pilot ready. Posts land here once the crew is up and running.`}
        </Editable>
      </EmptyState>
    </div>
  );
}
