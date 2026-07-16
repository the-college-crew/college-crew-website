import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { getSession, isProviderCapable } from "@/lib/auth/session";
import {
  hasAcceptedCurrentMasterAgreement,
  requiredMasterVariant,
  safeNextPath,
} from "@/lib/legal/acceptance";
import {
  getMasterSections,
  HOURLY_PAYMENT_AUTHORIZATION,
  HOURLY_TERMS_INTRO,
  HOURLY_TERMS_SECTIONS,
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

  // Provider-capable accounts owe the provider variant (extra sections);
  // everyone else the customer one. Capability, not account role, decides.
  const variant = requiredMasterVariant(
    session.profile.role,
    await isProviderCapable(),
  );

  const supabase = await createClient();
  const accepted = await hasAcceptedCurrentMasterAgreement(supabase, {
    userId: session.user.id,
    variant,
  });
  if (accepted) redirect(next);

  const sections = getMasterSections(variant);

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

          <section className="border-t border-line pt-5">
            <h2 className="font-display text-lg font-semibold text-ink">
              Hourly Booking Terms &amp; Fee Schedule
            </h2>
            <div className="mt-2 space-y-3">
              {HOURLY_TERMS_INTRO.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </div>
          </section>

          {HOURLY_TERMS_SECTIONS.map((section) => (
            <section key={section.title} className="border-t border-line pt-5">
              <h3 className="font-display text-base font-semibold text-ink">
                {section.title}
              </h3>
              <div className="mt-2 space-y-3">
                {section.body.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </div>
            </section>
          ))}

          <section className="border-t border-line pt-5">
            <h3 className="font-display text-base font-semibold text-ink">
              First-hour payment authorization
            </h3>
            <p className="mt-2 rounded-lg border border-line bg-court p-4">
              {HOURLY_PAYMENT_AUTHORIZATION}
            </p>
          </section>
        </div>

        <div className="mt-8 border-t border-line pt-6">
          <MasterAgreementForm next={next} />
        </div>
      </Card>
    </main>
  );
}
