import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { ProviderAvailabilityForm } from "@/app/(provider)/provider/_components/provider-availability-form";
import { WizardSteps } from "@/app/(provider)/provider/_components/wizard-steps";
import { buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getOwnProviderProfile, requireRole } from "@/lib/auth/session";
import { getProviderAvailabilityWindows } from "@/lib/db/queries";

import { saveOnboardingAvailability } from "../actions";

export const metadata: Metadata = {
  title: "Provider onboarding — availability",
};

/** Wizard step 4: per-day schedule windows for the hourly pilot. */
export default async function OnboardingAvailabilityPage() {
  await requireRole("provider", "/provider/onboarding/availability");
  const profile = await getOwnProviderProfile();
  if (!profile) redirect("/provider/onboarding/account");
  const windows = await getProviderAvailabilityWindows(profile.id);

  return (
    <div>
      <WizardSteps current="availability" />
      <Card pennant className="p-6">
        <h2 className="font-display text-xl font-semibold">
          When can neighbors book you?
        </h2>
        <p className="mt-1 text-sm text-ink-soft">
          Group the days that share the same hours, and add more windows for
          days with different hours. You can update these settings later from
          Profile &amp; settings.
        </p>

        <div className="mt-5">
          <ProviderAvailabilityForm
            values={{ ...profile, windows }}
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
