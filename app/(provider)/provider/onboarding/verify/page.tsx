import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getOwnProviderProfile, requireRole } from "@/lib/auth/session";

import { WizardSteps } from "../../_components/wizard-steps";
import { IdUploadForm } from "./id-upload-form";

export const metadata: Metadata = { title: "Provider onboarding — verify" };

/** Wizard step 2: student-ID upload for manual founder review. */
export default async function OnboardingVerifyPage() {
  await requireRole("provider", "/provider/onboarding/verify");
  const profile = await getOwnProviderProfile();
  if (!profile) redirect("/provider/onboarding/account");

  return (
    <div>
      <WizardSteps current="verify" />

      <Card pennant className="p-6">
        <h2 className="font-display text-xl font-semibold uppercase tracking-wide">
          Verify you&apos;re a student
        </h2>
        <p className="mt-1 text-sm text-ink-soft">
          Upload your student ID. A founder reviews it by hand — usually
          within a day — and you&apos;ll go live once approved.
        </p>

        {profile.id_document_url ? (
          <div className="mt-4 rounded-lg border border-quad-200 bg-quad-50 p-3 text-sm text-quad-800">
            ID uploaded ✓ — you can replace it below if it wasn&apos;t clear.
          </div>
        ) : null}

        <div className="mt-5">
          <IdUploadForm hasDocument={Boolean(profile.id_document_url)} />
        </div>

        <div className="mt-6 flex justify-between border-t border-line pt-4">
          <Link
            href="/provider/onboarding/account"
            className={buttonClasses({ variant: "ghost", size: "sm" })}
          >
            ← Back
          </Link>
          {profile.id_document_url ? (
            <Link
              href="/provider/onboarding/services"
              className={buttonClasses({ variant: "secondary", size: "sm" })}
            >
              Next: services →
            </Link>
          ) : null}
        </div>
      </Card>
    </div>
  );
}
