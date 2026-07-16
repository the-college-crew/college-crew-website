import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { getSession } from "@/lib/auth/session";
import {
  hasAcceptedCurrentLegalDocument,
  legalDocumentPath,
  safeNextPath,
  stableContentHash,
} from "@/lib/legal/acceptance";
import {
  CUSTOMER_BOOKING_TERMS_VERSION,
  getCustomerBookingTermsSnapshot,
} from "@/lib/legal/waivers";
import { createClient } from "@/lib/supabase/server";

import { LegalDocumentContent } from "../legal-document-content";
import { LegalDocumentForm } from "../legal-document-form";

export const metadata: Metadata = { title: "Customer Booking Terms" };

export default async function CustomerBookingTermsPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const [{ next: nextParam }, session] = await Promise.all([searchParams, getSession()]);
  const next = safeNextPath(nextParam);
  if (!session) {
    const legalNext = legalDocumentPath("customer_booking_terms", next);
    redirect(`/login?next=${encodeURIComponent(legalNext)}`);
  }
  if (session.profile.role === "admin") redirect("/admin");

  const supabase = await createClient();
  if (
    await hasAcceptedCurrentLegalDocument(supabase, {
      userId: session.user.id,
      kind: "customer_booking_terms",
    })
  ) {
    redirect(next);
  }

  const snapshot = getCustomerBookingTermsSnapshot();
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8">
      <PageHeader
        title="Customer Booking Terms"
        description={`Review these terms before sending your first request. Version ${CUSTOMER_BOOKING_TERMS_VERSION}.`}
      />
      <Card pennant className="mt-6 p-6">
        <LegalDocumentContent intro={snapshot.intro} sections={snapshot.sections} />
        <div className="mt-8 border-t border-line pt-6">
          <LegalDocumentForm
            kind="customer_booking_terms"
            next={next}
            renderedHash={stableContentHash(snapshot)}
          />
        </div>
      </Card>
    </main>
  );
}
