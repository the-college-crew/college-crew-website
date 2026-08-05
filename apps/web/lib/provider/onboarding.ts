import type { ProviderProfile } from "@/lib/db/types";

import { isPayoutsActive } from "./setup";

export type ProviderOnboardingStep =
  | "account"
  | "verify"
  | "services"
  | "availability"
  | "review"
  | "stripe"
  | "dashboard";

type OnboardingProfile = Pick<
  ProviderProfile,
  | "avatar_image_path"
  | "onboarding_submitted_at"
  | "school_name"
  | "stripe_account_id"
  | "stripe_transfers_active"
  | "stripe_transfers_checked_at"
  | "verification_status"
>;

export function resolveProviderOnboardingStep({
  profile,
  identitySatisfied,
  hasReadyOffering,
  availabilityComplete,
}: {
  profile: OnboardingProfile | null;
  identitySatisfied: boolean;
  hasReadyOffering: boolean;
  availabilityComplete: boolean;
}): ProviderOnboardingStep {
  if (!profile || !profile.school_name.trim()) return "account";

  // Rejection pauses payout onboarding. Founders can reopen the provider to
  // pending, which restores the same submitted Stripe step and account link.
  if (profile.verification_status === "rejected") return "dashboard";

  if (profile.onboarding_submitted_at) {
    return isPayoutsActive(profile) ? "dashboard" : "stripe";
  }

  if (!identitySatisfied || !profile.avatar_image_path) return "verify";
  if (!hasReadyOffering) return "services";
  if (!availabilityComplete) return "availability";
  return "review";
}

export function providerOnboardingPath(step: ProviderOnboardingStep) {
  return step === "dashboard"
    ? "/provider/dashboard"
    : `/provider/onboarding/${step}`;
}
