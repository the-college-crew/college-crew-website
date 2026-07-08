import type { Metadata } from "next";

import { SupportForm } from "./support-form";
import { PageHeader } from "@/components/ui/page-header";
import { getSession } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Feedback & support" };

function validSourcePath(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= 500 &&
    /^\/(?!\/)[^?#]*$/.test(value)
  );
}

export default async function SupportPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string | string[] }>;
}) {
  const [{ from }, session] = await Promise.all([
    searchParams,
    getSession(),
  ]);
  const sourcePath = validSourcePath(from) ? from : undefined;

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <PageHeader
        title="Feedback & support"
        description="Help us shape College Crew, report something that isn’t working, or tell us where you need help."
      />

      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(260px,1fr)]">
        <SupportForm
          defaultEmail={session?.user.email}
          sourcePath={sourcePath}
        />

        <aside className="space-y-5 text-sm leading-relaxed text-ink-soft">
          <section>
            <h2 className="font-display text-xl font-semibold text-viridian">
              Your feedback changes the pilot
            </h2>
            <p className="mt-2">
              We’re intentionally starting with one neighborhood and a small
              provider group. Specific feedback helps us decide what to fix,
              simplify, or build next.
            </p>
          </section>

          <section className="rounded-2xl border border-stone bg-paper p-5">
            <h2 className="font-semibold text-ink">What happens next</h2>
            <ul className="mt-3 space-y-2">
              <li>• Founders review every submission.</li>
              <li>• Messages are sorted by topic and experience.</li>
              <li>• We’ll use your email only if you request a response.</li>
            </ul>
          </section>

          <section className="rounded-2xl border border-red-200 bg-red-50 p-5 text-red-900">
            <h2 className="font-semibold">Not an emergency channel</h2>
            <p className="mt-2 text-xs leading-relaxed">
              This inbox is not monitored continuously. If anyone is in
              immediate danger, contact local emergency services.
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}
