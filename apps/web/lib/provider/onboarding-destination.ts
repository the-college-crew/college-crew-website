import "server-only";

import { getOwnProviderProfile } from "@/lib/auth/session";
import { getProviderAvailabilityWindows } from "@/lib/db/queries";
import { getVerifiedSchoolEmail } from "@/lib/db/school-email";
import {
  isOfferingPricingReady,
  isServiceZipSet,
  isStructuredAvailabilityComplete,
} from "@/lib/provider/setup";
import { isProviderIdentityVerificationSatisfied } from "@/lib/provider/verification";
import { createClient } from "@/lib/supabase/server";

import {
  providerOnboardingPath,
  resolveProviderOnboardingStep,
} from "./onboarding";

export async function getProviderOnboardingDestination(userId: string) {
  const profile = await getOwnProviderProfile();
  if (!profile) return "/provider/onboarding/account";

  const supabase = await createClient();
  const [schoolEmail, { data: offerings }, windows] = await Promise.all([
    getVerifiedSchoolEmail(userId),
    supabase
      .from("provider_services")
      .select(
        "hourly_rate_cents, pricing_mode, service:services(slug, is_live)",
      )
      .eq("provider_id", profile.id),
    getProviderAvailabilityWindows(profile.id),
  ]);

  const hasReadyOffering = (offerings ?? []).some(
    (offering) =>
      offering.service?.is_live &&
      isOfferingPricingReady({
        hourly_rate_cents: offering.hourly_rate_cents,
        pricing_mode: offering.pricing_mode,
        service_slug: offering.service.slug,
      }),
  );

  return providerOnboardingPath(
    resolveProviderOnboardingStep({
      profile,
      identitySatisfied: isProviderIdentityVerificationSatisfied(
        profile,
        Boolean(schoolEmail),
      ),
      hasReadyOffering,
      availabilityComplete:
        isStructuredAvailabilityComplete(windows) && isServiceZipSet(profile),
    }),
  );
}
