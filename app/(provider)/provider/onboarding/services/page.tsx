import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getOwnProviderProfile, requireRole } from "@/lib/auth/session";
import { getLiveServices } from "@/lib/db/queries";
import { createClient } from "@/lib/supabase/server";

import { ServicesPricingForm } from "../../_components/services-pricing-form";
import { WizardSteps } from "../../_components/wizard-steps";
import { saveOnboardingPricing } from "../actions";

export const metadata: Metadata = { title: "Provider onboarding — services" };

/** Wizard step 3: pick services + set pricing (editable later in settings). */
export default async function OnboardingServicesPage() {
  await requireRole("provider", "/provider/onboarding/services");
  const profile = await getOwnProviderProfile();
  if (!profile) redirect("/provider/onboarding/account");

  const supabase = await createClient();
  const [services, { data: offerings }] = await Promise.all([
    getLiveServices(),
    supabase
      .from("provider_services")
      .select("service_id, price_cents, price_type, unit")
      .eq("provider_id", profile.id),
  ]);

  return (
    <div>
      <WizardSteps current="services" />

      <Card pennant className="p-6">
        <h2 className="font-display text-xl font-semibold">
          What do you offer?
        </h2>
        <p className="mt-1 text-sm text-ink-soft">
          Pick from the curated service list and set your prices. College
          Crew&apos;s 15% comes out of your earnings on each booking — price
          accordingly.
        </p>

        <div className="mt-5">
          <ServicesPricingForm
            services={services}
            offerings={offerings ?? []}
            action={saveOnboardingPricing}
            submitLabel="Save & continue →"
          />
        </div>

        <div className="mt-6 border-t border-line pt-4">
          <Link
            href="/provider/onboarding/verify"
            className={buttonClasses({ variant: "ghost", size: "sm" })}
          >
            ← Back
          </Link>
        </div>
      </Card>
    </div>
  );
}
