import { describe, expect, it } from "vitest";

import type { ProviderProfile } from "@/lib/db/types";

import { getSettingsReadiness } from "./settings-readiness";

type PayoutProfile = Pick<
  ProviderProfile,
  | "verification_status"
  | "onboarding_submitted_at"
  | "stripe_account_id"
  | "stripe_transfers_active"
  | "stripe_transfers_checked_at"
  | "service_zip"
>;

const pendingSubmitted: PayoutProfile = {
  verification_status: "pending",
  onboarding_submitted_at: "2026-08-04T12:00:00.000Z",
  stripe_account_id: null,
  stripe_transfers_active: false,
  stripe_transfers_checked_at: null,
  service_zip: "60614",
};

function payoutIssues(profile: PayoutProfile) {
  return getSettingsReadiness({
    profile,
    offerings: [],
    windows: [],
    providerTermsAccepted: true,
  }).payouts;
}

describe("provider payout settings readiness", () => {
  it("makes Stripe actionable while founder review is pending", () => {
    expect(payoutIssues(pendingSubmitted)).toEqual([
      {
        key: "payouts",
        message: "Connect Stripe to receive payouts.",
        actionable: true,
      },
    ]);
  });

  it("does not prompt before College Crew submission or during rejection", () => {
    expect(
      payoutIssues({ ...pendingSubmitted, onboarding_submitted_at: null }),
    ).toEqual([]);
    expect(
      payoutIssues({ ...pendingSubmitted, verification_status: "rejected" }),
    ).toEqual([]);
  });

  it("clears the issue after the transfer capability is checked active", () => {
    expect(
      payoutIssues({
        ...pendingSubmitted,
        stripe_account_id: "acct_provider",
        stripe_transfers_active: true,
        stripe_transfers_checked_at: "2026-08-04T12:05:00.000Z",
      }),
    ).toEqual([]);
  });
});
