import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { LegalDocumentContent } from "@/app/(shared)/legal/legal-document-content";
import {
  getOwnProviderProfile,
  requireOnboardingUser,
} from "@/lib/auth/session";
import { getVerifiedSchoolEmail } from "@/lib/db/school-email";
import { getProviderAvailabilityWindows } from "@/lib/db/queries";
import {
  formatAvailabilityDays,
  formatAvailabilityWindow,
  groupAvailabilityWindows,
  isOfferingPricingReady,
  isStructuredAvailabilityComplete,
  verificationLabel,
} from "@/lib/provider/setup";
import { createClient } from "@/lib/supabase/server";
import { formatOfferedPrice } from "@/lib/utils";
import {
  hasAcceptedCurrentLegalDocument,
  stableContentHash,
} from "@/lib/legal/acceptance";
import {
  getProviderTermsSnapshot,
  PROVIDER_TERMS_VERSION,
} from "@/lib/legal/waivers";
import {
  hasActiveProviderVerificationBypass,
  isProviderIdentityVerificationSatisfied,
} from "@/lib/provider/verification";

import { WizardSteps } from "../../_components/wizard-steps";
import { ReviewSubmitForm } from "./review-submit-form";

export const metadata: Metadata = { title: "Provider onboarding — review" };

/** Wizard step 5: review & submit. Stripe connects later, after approval. */
export default async function OnboardingReviewPage() {
  const session = await requireOnboardingUser("/provider/onboarding/review");
  const profile = await getOwnProviderProfile();
  if (!profile) redirect("/provider/onboarding/account");

  const supabase = await createClient();
  const [{ data: offerings }, windows] = await Promise.all([
    supabase
      .from("provider_services")
      .select(
        "id, price_cents, price_type, unit, hourly_rate_cents, pricing_mode, average_quote_cents, service:services(name, slug, is_live)",
      )
      .eq("provider_id", profile.id),
    getProviderAvailabilityWindows(profile.id),
  ]);
  const liveOfferings = (offerings ?? []).filter(
    (offered) =>
      offered.service?.is_live &&
      isOfferingPricingReady({
        hourly_rate_cents: offered.hourly_rate_cents,
        pricing_mode: offered.pricing_mode,
        service_slug: offered.service.slug,
      }),
  );

  const schoolEmail = await getVerifiedSchoolEmail(session.user.id);
  const providerTermsAccepted = await hasAcceptedCurrentLegalDocument(supabase, {
    userId: session.user.id,
    kind: "provider_terms",
  });
  const providerTerms = getProviderTermsSnapshot();

  const licenseComplete =
    Boolean(profile.id_document_url) && Boolean(profile.id_document_back_url);
  const verificationBypassed = hasActiveProviderVerificationBypass(profile);
  const identitySatisfied = isProviderIdentityVerificationSatisfied(
    profile,
    Boolean(schoolEmail),
  );
  const ready =
    identitySatisfied &&
    Boolean(profile.school_name.trim()) &&
    Boolean(profile.avatar_image_path) &&
    liveOfferings.length > 0 &&
    isStructuredAvailabilityComplete(windows) &&
    Boolean(profile.service_zip);
  const availabilityGroups = groupAvailabilityWindows(windows);

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
              ) : verificationBypassed ? (
                "Waived by founder ✓"
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
            <dt className="text-mist">College or university</dt>
            <dd className="text-right font-medium">
              {profile.school_name ? (
                <>
                  {profile.school_name}
                  {profile.greek_organization
                    ? ` · ${profile.greek_organization}`
                    : ""}
                </>
              ) : (
                <Link
                  href="/provider/onboarding/account"
                  className="text-crew-700 underline"
                >
                  Missing — add it
                </Link>
              )}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-mist">Driver&apos;s license</dt>
            <dd className="font-medium">
              {licenseComplete ? (
                "Front & back uploaded ✓"
              ) : verificationBypassed ? (
                "Waived by founder ✓"
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
          <div className="flex justify-between gap-4">
            <dt className="text-mist">Profile photo</dt>
            <dd className="font-medium">
              {profile.avatar_image_path ? (
                "Added ✓"
              ) : (
                <Link
                  href="/provider/onboarding/verify?err=photo"
                  className="text-crew-700 underline"
                >
                  Missing - add it
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
          <div>
            <dt className="text-mist">General availability</dt>
            <dd className="mt-1.5 rounded-lg bg-court px-3 py-2">
              {availabilityGroups.length > 0 ? (
                <>
                  {availabilityGroups.map((group) => (
                    <p key={`${group.start}-${group.end}`} className="font-medium">
                      {formatAvailabilityDays(group.weekdays)} ·{" "}
                      {formatAvailabilityWindow(group.start, group.end)}
                    </p>
                  ))}
                  {profile.availability_note ? (
                    <p className="mt-1 text-xs text-ink-soft">
                      {profile.availability_note}
                    </p>
                  ) : null}
                  <p className="mt-1 text-xs text-mist">
                    {profile.minimum_notice_hours} hours minimum notice
                  </p>
                </>
              ) : (
                <Link
                  href="/provider/onboarding/availability"
                  className="text-crew-700 underline"
                >
                  Missing — set availability
                </Link>
              )}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-mist">Service ZIP</dt>
            <dd className="text-right font-medium">
              {profile.service_zip ? (
                <>
                  {profile.service_zip}
                  <span className="block text-xs font-normal text-mist">
                    Private; never shown publicly
                  </span>
                </>
              ) : (
                <Link
                  href="/provider/onboarding/availability"
                  className="text-crew-700 underline"
                >
                  Missing
                </Link>
              )}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-mist">Approval</dt>
            <dd className="font-medium">
              {verificationLabel(profile.verification_status)}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-mist">Stripe payouts</dt>
            <dd className="text-right font-medium">
              {profile.stripe_transfers_active
                ? "Active"
                : "Connect after founder approval"}
            </dd>
          </div>
        </dl>

        <div className="mt-5 rounded-lg border border-line bg-court p-3 text-xs text-ink-soft">
          {verificationBypassed
            ? "Your verification was approved by a founder. Finish the remaining setup and accept the Provider Addendum, then connect Stripe from your dashboard."
            : "What happens next: a founder reviews your license. Once approved, you’ll connect a bank account through Stripe from your dashboard and appear in Browse."}
        </div>

        <section className="mt-6 border-t border-line pt-5">
          <h2 className="font-display text-xl font-semibold">
            Provider Addendum
          </h2>
          <p className="mt-1 text-sm text-ink-soft">
            Version {PROVIDER_TERMS_VERSION}. These are only the additional
            terms that apply when you provide services.
          </p>
          {providerTermsAccepted ? (
            <p className="mt-4 rounded-lg border border-quad-200 bg-quad-50 p-3 text-sm font-medium text-quad-800">
              ✓ Current Provider Addendum accepted
            </p>
          ) : (
            <div className="mt-4 rounded-xl border border-line bg-paper p-4">
              <LegalDocumentContent
                intro={providerTerms.intro}
                sections={providerTerms.sections}
              />
            </div>
          )}
        </section>

        <div className="mt-6 flex items-center justify-between border-t border-line pt-4">
          <Link
            href="/provider/onboarding/availability"
            className={buttonClasses({ variant: "ghost", size: "sm" })}
          >
            ← Back
          </Link>
          <ReviewSubmitForm
            ready={ready}
            providerTermsAccepted={providerTermsAccepted}
            renderedProviderTermsHash={stableContentHash(providerTerms)}
          />
        </div>
      </Card>
    </div>
  );
}
