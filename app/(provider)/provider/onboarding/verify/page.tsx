import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { AvatarUploadForm } from "@/app/(shared)/account/avatar-upload-form";
import { getOwnProviderProfile, requireRole } from "@/lib/auth/session";
import {
  getPendingSchoolEmail,
  getVerifiedSchoolEmail,
} from "@/lib/db/school-email";
import { providerAvatarUrl } from "@/lib/media/provider-avatars";
import { createClient } from "@/lib/supabase/server";

import { WizardSteps } from "../../_components/wizard-steps";
import { IdUploadForm } from "./id-upload-form";
import { SchoolEmailForm } from "./school-email-form";

export const metadata: Metadata = { title: "Provider onboarding — verify" };

/** Wizard step 2: verify school email (.edu OTP) + upload driver's license. */
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
  const hasFront = Boolean(profile.id_document_url);
  const hasBack = Boolean(profile.id_document_back_url);
  const idUploaded = hasFront && hasBack;
  const hasAvatar = Boolean(profile.avatar_image_path);
  const avatarUrl = providerAvatarUrl(profile.avatar_image_path);
  const readyForNext = schoolVerified && idUploaded && hasAvatar;
  const supabase = await createClient();
  const signDocument = async (path: string | null) => {
    if (!path) return null;
    const { data } = await supabase.storage
      .from("id-documents")
      .createSignedUrl(path, 5 * 60);
    return data?.signedUrl ?? null;
  };
  const [frontUrl, backUrl] = await Promise.all([
    signDocument(profile.id_document_url),
    signDocument(profile.id_document_back_url),
  ]);
  const approved = profile.verification_status === "approved";
  const rejected = profile.verification_status === "rejected";

  return (
    <div>
      <WizardSteps current="verify" />

      <VerificationStatusCard
        approved={approved}
        rejected={rejected}
        schoolVerified={schoolVerified}
        hasFront={hasFront}
        hasBack={hasBack}
        hasAvatar={hasAvatar}
        frontUrl={frontUrl}
        backUrl={backUrl}
      />

      {approved ? (
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/provider/dashboard"
            className={buttonClasses({ variant: "secondary", size: "sm" })}
          >
            Go to dashboard →
          </Link>
          <Link
            href="/account"
            className={buttonClasses({ variant: "ghost", size: "sm" })}
          >
            Profile & settings
          </Link>
        </div>
      ) : (
        <>

          <Card pennant className="mt-4 p-6">
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
              Upload your driver&apos;s license
            </h2>
            <p className="mt-1 text-sm text-ink-soft">
              Take a photo of the front and the back (barcode side). A founder
              reviews them by hand — usually within a day — and you&apos;ll go live
              once approved.
            </p>

            {idUploaded ? (
              <div className="mt-4 rounded-lg border border-quad-200 bg-quad-50 p-3 text-sm text-quad-800">
                License uploaded ✓ — you can replace either side below if it
                wasn&apos;t clear.
              </div>
            ) : null}

            <div className="mt-5">
              <IdUploadForm hasFront={hasFront} hasBack={hasBack} />
            </div>
          </Card>

          <Card pennant className="mt-4 p-6">
            <h2 className="font-display text-xl font-semibold">
              Add your profile photo
            </h2>
            <p className="mt-1 text-sm text-ink-soft">
              This is public — a clear photo of your face so neighbors know who
              they&apos;re inviting over. It shows on Browse and your profile, and
              is required before you can go live.
            </p>

            <div className="mt-5">
              <AvatarUploadForm imageUrl={avatarUrl} />
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
                Verify your school email, upload your ID, and add a profile photo
                to continue.
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function VerificationStatusCard({
  approved,
  rejected,
  schoolVerified,
  hasFront,
  hasBack,
  hasAvatar,
  frontUrl,
  backUrl,
}: {
  approved: boolean;
  rejected: boolean;
  schoolVerified: boolean;
  hasFront: boolean;
  hasBack: boolean;
  hasAvatar: boolean;
  frontUrl: string | null;
  backUrl: string | null;
}) {
  const complete = schoolVerified && hasFront && hasBack && hasAvatar;
  const title = approved
    ? "You’re verified"
    : rejected
      ? "Verification needs attention"
      : complete
        ? "Your documents are ready"
        : "Finish your verification";
  const description = approved
    ? "Your school email and ID are approved. Your provider profile can appear in Browse."
    : rejected
      ? "A founder needs an updated document before your profile can go live."
      : complete
        ? "Your school email and license are on file. Finish onboarding, then a founder will review them."
        : "Complete each item below before moving on to services and pricing.";

  return (
    <Card
      pennant
      className={
        approved
          ? "border-quad-300 bg-quad-50 p-6"
          : rejected
            ? "border-gold-400/70 bg-gold-100 p-6"
            : "p-6"
      }
    >
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-mist">
        Verification status
      </p>
      <h2 className="mt-2 font-display text-2xl font-semibold">{title}</h2>
      <p className="mt-2 text-sm leading-relaxed text-ink-soft">{description}</p>

      <ul className="mt-5 grid gap-2 text-sm sm:grid-cols-3">
        <li className="rounded-lg border border-line bg-paper/70 px-3 py-2">
          <span className="block text-xs text-mist">School email</span>
          <span className="font-semibold text-ink">
            {schoolVerified ? "Verified ✓" : "Not verified"}
          </span>
        </li>
        <li className="rounded-lg border border-line bg-paper/70 px-3 py-2">
          <span className="block text-xs text-mist">License front</span>
          <span className="font-semibold text-ink">
            {hasFront ? "Uploaded ✓" : "Missing"}
          </span>
        </li>
        <li className="rounded-lg border border-line bg-paper/70 px-3 py-2">
          <span className="block text-xs text-mist">License back</span>
          <span className="font-semibold text-ink">
            {hasBack ? "Uploaded ✓" : "Missing"}
          </span>
        </li>
        <li className="rounded-lg border border-line bg-paper/70 px-3 py-2">
          <span className="block text-xs text-mist">Profile photo</span>
          <span className="font-semibold text-ink">
            {hasAvatar ? "Added ✓" : "Missing"}
          </span>
        </li>
      </ul>

      {frontUrl || backUrl ? (
        <div className="mt-5 border-t border-line pt-4">
          <p className="text-xs text-mist">
            Your uploaded license is private. These secure links expire in five minutes.
          </p>
          <div className="mt-2 flex flex-wrap gap-3 text-sm font-semibold text-crew-700">
            {frontUrl ? (
              <a href={frontUrl} target="_blank" rel="noreferrer" className="underline">
                View front upload
              </a>
            ) : null}
            {backUrl ? (
              <a href={backUrl} target="_blank" rel="noreferrer" className="underline">
                View back upload
              </a>
            ) : null}
          </div>
        </div>
      ) : null}
    </Card>
  );
}
