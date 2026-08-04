import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  needsProfileCompletion,
  profileCompletionPath,
} from "@/lib/auth/redirects";
import { getOwnProviderProfile, getSession } from "@/lib/auth/session";

import { WizardSteps } from "../../_components/wizard-steps";
import { ProviderSignupForm } from "./provider-signup-form";
import { StartProviderForm } from "./start-provider-form";

export const metadata: Metadata = { title: "Provider onboarding — account" };

/**
 * Wizard step 1: account. Doubles as provider-intent signup when logged out;
 * signed-in users (including existing customers — providing is a capability
 * any account can add) continue with the facts signup didn't collect.
 */
export default async function OnboardingAccountPage({
  searchParams,
}: {
  searchParams: Promise<{ oauth_error?: string }>;
}) {
  const { oauth_error: oauthError } = await searchParams;
  const session = await getSession();
  if (
    session &&
    session.profile.role !== "admin" &&
    needsProfileCompletion(session.profile)
  ) {
    redirect(profileCompletionPath("/provider/onboarding/account"));
  }
  const providerProfile = session ? await getOwnProviderProfile() : null;

  return (
    <div>
      <WizardSteps current="account" />

      {!session ? (
        <Card pennant className="p-6">
          <h2 className="font-display text-xl font-semibold">
            Create your account
          </h2>
          <p className="mt-1 text-sm text-ink-soft">
            Providers are college students, 18 or older, verified by the
            founders.
          </p>
          <div className="mt-5">
            <ProviderSignupForm oauthError={oauthError} />
          </div>
          <p className="mt-4 text-center text-sm text-ink-soft">
            Already have an account (customer accounts count)?{" "}
            <Link
              href="/login?next=/provider/onboarding/account"
              className="font-semibold text-crew-700"
            >
              Log in to continue
            </Link>
          </p>
        </Card>
      ) : session.profile.role !== "admin" ? (
        <Card pennant className="p-6">
          <h2 className="font-display text-xl font-semibold">
            {providerProfile ? "Account ready ✓" : "Start providing"}
          </h2>
          {providerProfile ? null : (
            <p className="mt-1 text-sm text-ink-soft">
              Your College Crew account works for providing too — finish this
              step and we&apos;ll verify you as a student provider.
            </p>
          )}
          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-mist">Name</dt>
              <dd className="font-medium">{session.profile.full_name}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-mist">Email</dt>
              <dd className="font-medium">{session.user.email}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-mist">Email confirmed</dt>
              <dd className="font-medium">
                {session.user.email_confirmed_at ? "Yes" : "Not yet — check your inbox"}
              </dd>
            </div>
          </dl>
          <div className="mt-6">
            {/* DOB is asked whenever the profile lacks one — even with an
                existing provider row (e.g. created outside this wizard), the
                18+ gate still has to be satisfied to continue. */}
            <StartProviderForm
              needsDateOfBirth={!session.profile.date_of_birth}
              askCompanyName={!providerProfile}
              schoolName={providerProfile?.school_name}
              schoolScorecardId={providerProfile?.school_scorecard_id}
              greekOrganization={providerProfile?.greek_organization}
            />
          </div>
        </Card>
      ) : (
        <Card className="p-6 text-sm text-ink-soft">
          <p>
            You&apos;re signed in as a founder. Founder accounts don&apos;t
            offer services — use the view-as switcher to preview the provider
            experience instead.
          </p>
          <Link
            href="/"
            className={buttonClasses({
              variant: "secondary",
              size: "sm",
              className: "mt-4",
            })}
          >
            Back to home
          </Link>
        </Card>
      )}
    </div>
  );
}
