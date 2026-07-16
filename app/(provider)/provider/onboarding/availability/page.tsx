import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { ProviderAvailabilityForm } from "@/app/(provider)/provider/_components/provider-availability-form";
import { WizardSteps } from "@/app/(provider)/provider/_components/wizard-steps";
import { buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  getOwnProviderProfile,
  requireOnboardingUser,
} from "@/lib/auth/session";

import { saveOnboardingAvailability } from "../actions";

export const metadata: Metadata = {
  title: "Provider onboarding — availability",
};

/** Wizard step 4: one provider-wide schedule for the hourly pilot. */
export default async function OnboardingAvailabilityPage() {
  await requireOnboardingUser("/provider/onboarding/availability");
  const profile = await getOwnProviderProfile();
  if (!profile) redirect("/provider/onboarding/account");

  return (
    <div>
      <WizardSteps current="availability" />
      <Card pennant className="p-6">
        <h2 className="font-display text-xl font-semibold">
          When can neighbors book you?
        </h2>
        <p className="mt-1 text-sm text-ink-soft">
          Choose your general days and one shared time window. You can update
          these settings later from Profile &amp; settings.
        </p>

        <div className="mt-5">
          <ProviderAvailabilityForm
            values={profile}
            action={saveOnboardingAvailability}
            submitLabel="Save & continue →"
            navigates
          />
        </div>

        <div className="mt-6 border-t border-line pt-4">
          <Link
            href="/provider/onboarding/services"
            className={buttonClasses({ variant: "ghost", size: "sm" })}
          >
            ← Back
          </Link>
        </div>
      </Card>
    </div>
  );
}
