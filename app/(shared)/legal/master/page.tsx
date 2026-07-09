import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { getSession } from "@/lib/auth/session";
import {
  hasAcceptedCurrentMasterAgreement,
  safeNextPath,
} from "@/lib/legal/acceptance";
import {
  getMasterSections,
  LEGAL_CONTENT_VERSION,
  MASTER_INTRO,
} from "@/lib/legal/waivers";
import { createClient } from "@/lib/supabase/server";

import { MasterAgreementForm } from "./master-agreement-form";

export const metadata: Metadata = { title: "Master Service Agreement" };

export default async function MasterAgreementPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const [{ next: nextParam }, session] = await Promise.all([
    searchParams,
    getSession(),
  ]);
  const next = safeNextPath(nextParam);
  if (!session) {
    const legalNext = `/legal/master?next=${encodeURIComponent(next)}`;
    redirect(`/login?next=${encodeURIComponent(legalNext)}`);
  }

  const supabase = await createClient();
  const accepted = await hasAcceptedCurrentMasterAgreement(supabase, {
    userId: session.user.id,
    role: session.profile.role,
  });
  if (accepted) redirect(next);

  const sections = getMasterSections(session.profile.role);

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8">
      <PageHeader
        title="Master Service Agreement"
        description={`Review and accept the current College Crew agreement before continuing. Version ${LEGAL_CONTENT_VERSION}.`}
      />

      <Card pennant className="mt-6 p-6">
        <div className="space-y-5 text-sm leading-6 text-ink-soft">
          {MASTER_INTRO.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}

          {sections.map((section) => (
            <section key={section.number} className="border-t border-line pt-5">
              <h2 className="font-display text-lg font-semibold text-ink">
                {section.number}. {section.title}
              </h2>
              <div className="mt-2 space-y-3">
                {section.body.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </div>
            </section>
          ))}
        </div>

        <div className="mt-8 border-t border-line pt-6">
          <MasterAgreementForm next={next} />
        </div>
      </Card>
    </main>
  );
}
