import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { FormLoader } from "@/components/form-loader";
import { Button, buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getOwnProviderProfile, requireRole } from "@/lib/auth/session";
import { getVerifiedSchoolEmail } from "@/lib/db/school-email";
import { createClient } from "@/lib/supabase/server";
import { formatOfferedPrice } from "@/lib/utils";

import { WizardSteps } from "../../_components/wizard-steps";
import { submitForReview } from "../actions";

export const metadata: Metadata = { title: "Provider onboarding — review" };

/** Wizard step 4: review & submit. Stripe connects later, after approval. */
export default async function OnboardingReviewPage() {
  const session = await requireRole("provider", "/provider/onboarding/review");
  const profile = await getOwnProviderProfile();
  if (!profile) redirect("/provider/onboarding/account");

  const supabase = await createClient();
  const { data: offerings } = await supabase
    .from("provider_services")
    .select("id, price_cents, price_type, unit, service:services(name, is_live)")
    .eq("provider_id", profile.id);
  const liveOfferings = (offerings ?? []).filter(
    (offered) => offered.service?.is_live,
  );

  const schoolEmail = await getVerifiedSchoolEmail(session.user.id);

  const licenseComplete =
    Boolean(profile.id_document_url) && Boolean(profile.id_document_back_url);
  const ready =
    Boolean(schoolEmail) && licenseComplete && liveOfferings.length > 0;

  return (
    <div>
      <WizardSteps current="review" />

      <Card pennant className="p-6">
        <h2 className="font-display text-xl font-semibold">
          Review & submit
        </h2>

        <dl className="mt-4 space-y-3 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-mist">Name</dt>
            <dd className="font-medium">{session.profile.full_name}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-mist">Email</dt>
            <dd className="font-medium">{session.user.email}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-mist">School email</dt>
            <dd className="font-medium">
              {schoolEmail ? (
                `${schoolEmail.email} ✓`
              ) : (
                <Link
                  href="/provider/onboarding/verify"
                  className="text-crew-700 underline"
                >
                  Not verified — verify it
                </Link>
              )}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-mist">Driver&apos;s license</dt>
            <dd className="font-medium">
              {licenseComplete ? (
                "Front & back uploaded ✓"
              ) : (
                <Link
                  href="/provider/onboarding/verify"
                  className="text-crew-700 underline"
                >
                  {profile.id_document_url || profile.id_document_back_url
                    ? "One side missing — finish it"
                    : "Missing — upload it"}
                </Link>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-mist">Services</dt>
            <dd className="mt-1.5">
              {liveOfferings.length > 0 ? (
                <ul className="space-y-1">
                  {liveOfferings.map((offered) => (
                    <li
                      key={offered.id}
                      className="flex justify-between gap-4 rounded-lg bg-court px-3 py-1.5"
                    >
                      <span className="font-medium">{offered.service.name}</span>
                      <span className="font-semibold text-quad-700">
                        {formatOfferedPrice(offered)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <Link
                  href="/provider/onboarding/services"
                  className="text-crew-700 underline"
                >
                  None currently live — pick your services
                </Link>
              )}
              {(offerings?.length ?? 0) > liveOfferings.length ? (
                <p className="mt-2 text-xs text-mist">
                  Hidden service offerings are preserved and will reappear if a
                  founder makes that service live again.
                </p>
              ) : null}
            </dd>
          </div>
        </dl>

        <div className="mt-5 rounded-lg border border-line bg-court p-3 text-xs text-ink-soft">
          What happens next: a founder reviews your license. Once approved,
          you&apos;ll connect a bank account through Stripe from your
          dashboard and appear in Browse.
        </div>

        <div className="mt-6 flex items-center justify-between border-t border-line pt-4">
          <Link
            href="/provider/onboarding/services"
            className={buttonClasses({ variant: "ghost", size: "sm" })}
          >
            ← Back
          </Link>
          <form action={submitForReview}>
            <FormLoader />
            <Button type="submit" size="lg" disabled={!ready}>
              Submit for review
            </Button>
          </form>
        </div>
      </Card>
    </div>
  );
}
