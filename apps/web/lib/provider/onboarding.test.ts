import { describe, expect, it } from "vitest";

import type { ProviderProfile } from "@/lib/db/types";

import {
  providerOnboardingPath,
  resolveProviderOnboardingStep,
} from "./onboarding";

type TestProfile = Pick<
  ProviderProfile,
  | "avatar_image_path"
  | "onboarding_submitted_at"
  | "school_name"
  | "stripe_account_id"
  | "stripe_transfers_active"
  | "stripe_transfers_checked_at"
  | "verification_status"
>;

const readyProfile: TestProfile = {
  avatar_image_path: "provider/photo.jpg",
  onboarding_submitted_at: null,
  school_name: "Northwestern University",
  stripe_account_id: null,
  stripe_transfers_active: false,
  stripe_transfers_checked_at: null,
  verification_status: "pending",
};

function resolve(
  profile: TestProfile | null,
  overrides: Partial<{
    identitySatisfied: boolean;
    hasReadyOffering: boolean;
    availabilityComplete: boolean;
  }> = {},
) {
  return resolveProviderOnboardingStep({
    profile,
    identitySatisfied: true,
    hasReadyOffering: true,
    availabilityComplete: true,
    ...overrides,
  });
}

describe("resolveProviderOnboardingStep", () => {
  it("starts accounts without a provider profile at account", () => {
    expect(resolve(null)).toBe("account");
  });

  it("uses the earliest incomplete College Crew step", () => {
    expect(resolve({ ...readyProfile, school_name: "" })).toBe("account");
    expect(resolve(readyProfile, { identitySatisfied: false })).toBe("verify");
    expect(resolve({ ...readyProfile, avatar_image_path: null })).toBe("verify");
    expect(resolve(readyProfile, { hasReadyOffering: false })).toBe("services");
    expect(resolve(readyProfile, { availabilityComplete: false })).toBe(
      "availability",
    );
    expect(resolve(readyProfile)).toBe("review");
  });

  it("moves a submitted pending or approved provider to Stripe", () => {
    const submitted = {
      ...readyProfile,
      onboarding_submitted_at: "2026-08-04T12:00:00.000Z",
    };
    expect(resolve(submitted)).toBe("stripe");
    expect(resolve({ ...submitted, verification_status: "approved" })).toBe(
      "stripe",
    );
  });

  it("lands on the dashboard after Stripe transfers are active", () => {
    expect(
      resolve({
        ...readyProfile,
        onboarding_submitted_at: "2026-08-04T12:00:00.000Z",
        stripe_account_id: "acct_provider",
        stripe_transfers_active: true,
        stripe_transfers_checked_at: "2026-08-04T12:05:00.000Z",
      }),
    ).toBe("dashboard");
  });

  it("pauses rejected providers on the dashboard until reopened", () => {
    const submitted = {
      ...readyProfile,
      onboarding_submitted_at: "2026-08-04T12:00:00.000Z",
      verification_status: "rejected" as const,
    };
    expect(resolve(submitted)).toBe("dashboard");
    expect(resolve({ ...submitted, verification_status: "pending" })).toBe(
      "stripe",
    );
  });
});

describe("providerOnboardingPath", () => {
  it("maps dashboard separately from wizard steps", () => {
    expect(providerOnboardingPath("dashboard")).toBe("/provider/dashboard");
    expect(providerOnboardingPath("stripe")).toBe(
      "/provider/onboarding/stripe",
    );
  });
});
