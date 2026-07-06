import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getOwnProviderProfile, requireRole } from "@/lib/auth/session";
import {
  getPendingSchoolEmail,
  getVerifiedSchoolEmail,
} from "@/lib/db/school-email";

import { WizardSteps } from "../../_components/wizard-steps";
import { IdUploadForm } from "./id-upload-form";
import { SchoolEmailForm } from "./school-email-form";

export const metadata: Metadata = { title: "Provider onboarding — verify" };

/** Wizard step 2: verify school email (.edu OTP) + upload student ID. */
export default async function OnboardingVerifyPage() {
  const session = await requireRole("provider", "/provider/onboarding/verify");
  const profile = await getOwnProviderProfile();
  if (!profile) redirect("/provider/onboarding/account");

  const [schoolEmail, pending] = await Promise.all([
    getVerifiedSchoolEmail(session.user.id),
    getPendingSchoolEmail(session.user.id),
  ]);

  // A .edu login email that Supabase already confirmed can skip the OTP.
  const loginEmail = session.user.email?.toLowerCase() ?? null;
  const accountEmailEligible =
    loginEmail && loginEmail.endsWith(".edu") && session.user.email_confirmed_at
      ? loginEmail
      : null;

  const schoolVerified = Boolean(schoolEmail);
  const idUploaded = Boolean(profile.id_document_url);
  const readyForNext = schoolVerified && idUploaded;

  return (
    <div>
      <WizardSteps current="verify" />

      <Card pennant className="p-6">
        <h2 className="font-display text-xl font-semibold">
          Verify your school email
        </h2>
        <p className="mt-1 text-sm text-ink-soft">
          Confirm a school (.edu) email so we know you&apos;re a student. Your
          login email stays private — this is separate.
        </p>

        <div className="mt-5">
          <SchoolEmailForm
            verifiedEmail={schoolEmail?.email ?? null}
            pendingEmail={pending?.email ?? null}
            accountEmail={accountEmailEligible}
          />
        </div>
      </Card>

      <Card pennant className="mt-4 p-6">
        <h2 className="font-display text-xl font-semibold">
          Upload your student ID
        </h2>
        <p className="mt-1 text-sm text-ink-soft">
          A founder reviews it by hand — usually within a day — and you&apos;ll
          go live once approved.
        </p>

        {idUploaded ? (
          <div className="mt-4 rounded-lg border border-quad-200 bg-quad-50 p-3 text-sm text-quad-800">
            ID uploaded ✓ — you can replace it below if it wasn&apos;t clear.
          </div>
        ) : null}

        <div className="mt-5">
          <IdUploadForm hasDocument={idUploaded} />
        </div>
      </Card>

      <div className="mt-6 flex justify-between border-t border-line pt-4">
        <Link
          href="/provider/onboarding/account"
          className={buttonClasses({ variant: "ghost", size: "sm" })}
        >
          ← Back
        </Link>
        {readyForNext ? (
          <Link
            href="/provider/onboarding/services"
            className={buttonClasses({ variant: "secondary", size: "sm" })}
          >
            Next: services →
          </Link>
        ) : (
          <span className="self-center text-xs text-mist">
            Verify your school email and upload your ID to continue.
          </span>
        )}
      </div>
    </div>
  );
}
