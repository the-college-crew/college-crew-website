import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { getOwnProviderProfile, getSession } from "@/lib/auth/session";
import {
  hasAcceptedCurrentLegalDocument,
  safeNextPath,
  stableContentHash,
} from "@/lib/legal/acceptance";
import {
  getProviderTermsSnapshot,
  PROVIDER_TERMS_VERSION,
} from "@/lib/legal/waivers";
import { createClient } from "@/lib/supabase/server";

import { LegalDocumentContent } from "../legal-document-content";
import { LegalDocumentForm } from "../legal-document-form";

export const metadata: Metadata = { title: "Provider Addendum" };

export default async function ProviderTermsPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const [{ next: nextParam }, session] = await Promise.all([searchParams, getSession()]);
  const next = safeNextPath(nextParam);
  if (!session) redirect(`/login?next=${encodeURIComponent(`/legal/provider?next=${encodeURIComponent(next)}`)}`);
  if (session.profile.role === "admin") redirect("/admin");
  if (!(await getOwnProviderProfile())) redirect("/provider/onboarding/account");

  const supabase = await createClient();
  if (
    await hasAcceptedCurrentLegalDocument(supabase, {
      userId: session.user.id,
      kind: "provider_terms",
    })
  ) {
    redirect(next);
  }

  const snapshot = getProviderTermsSnapshot();
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8">
      <PageHeader
        title="Provider Addendum"
        description={`Only the terms that apply when you provide services. Version ${PROVIDER_TERMS_VERSION}.`}
      />
      <Card pennant className="mt-6 p-6">
        <LegalDocumentContent intro={snapshot.intro} sections={snapshot.sections} />
        <div className="mt-8 border-t border-line pt-6">
          <LegalDocumentForm
            kind="provider_terms"
            next={next}
            renderedHash={stableContentHash(snapshot)}
          />
        </div>
      </Card>
    </main>
  );
}
