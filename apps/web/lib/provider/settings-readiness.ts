import type { ProviderProfile } from "@/lib/db/types";

import {
  isOfferingPricingReady,
  isPayoutsActive,
  isServiceZipSet,
  isStructuredAvailabilityComplete,
  type AvailabilityWindow,
} from "./setup";

export type SettingsTabId =
  | "storefront"
  | "availability"
  | "pricing"
  | "payouts"
  | "account"
  | "become-provider"
  | "legal"
  | "delete";

export type ReadinessIssue = {
  key: string;
  message: string;
  /**
   * Whether the provider can personally resolve it. Founder-controlled items
   * (ID review, flipping a service live) render as neutral in-panel notices
   * and never turn a sidebar tab red — a red badge on something you can't fix
   * is just anxiety.
   */
  actionable: boolean;
};

export type SettingsReadiness = Record<SettingsTabId, ReadinessIssue[]>;

export type ReadinessOfferingInput = {
  id: string;
  name: string;
  hourly_rate_cents: number | null;
  pricing_mode: "hourly" | "quote";
  average_quote_cents: number | null;
  service_slug: string;
  service_is_live: boolean;
};

const EMPTY: SettingsReadiness = {
  storefront: [],
  availability: [],
  pricing: [],
  payouts: [],
  account: [],
  "become-provider": [],
  legal: [],
  delete: [],
};

/** No outstanding setup anywhere — used for the admin sample preview. */
export function emptySettingsReadiness(): SettingsReadiness {
  return { ...EMPTY };
}

/**
 * Regroups the provider setup requirements by the settings tab that fixes
 * each one. Pure: the caller fetches once and hands the same result to both
 * the sidebar (for badge counts) and the active panel (for its notices).
 */
export function getSettingsReadiness({
  profile,
  offerings,
  windows,
  providerTermsAccepted,
}: {
  profile: Pick<
    ProviderProfile,
    | "verification_status"
    | "onboarding_submitted_at"
    | "stripe_account_id"
    | "stripe_transfers_active"
    | "stripe_transfers_checked_at"
    | "service_zip"
  >;
  offerings: readonly ReadinessOfferingInput[];
  windows: readonly AvailabilityWindow[];
  providerTermsAccepted: boolean;
}): SettingsReadiness {
  const availability: ReadinessIssue[] = [];
  if (!isStructuredAvailabilityComplete(windows)) {
    availability.push({
      key: "availability",
      message: "Set the days and hours you work.",
      actionable: true,
    });
  }
  if (!isServiceZipSet(profile)) {
    availability.push({
      key: "service_zip",
      message:
        "Add your private service ZIP so we can match you with nearby neighbors.",
      actionable: true,
    });
  }

  const pricing: ReadinessIssue[] = [];
  if (offerings.length === 0) {
    pricing.push({
      key: "no_offerings",
      message:
        "Add at least one service and its pricing before neighbors can book you.",
      actionable: true,
    });
  }
  for (const offering of offerings) {
    if (!isOfferingPricingReady(offering)) {
      pricing.push({
        key: `pricing:${offering.id}`,
        message:
          offering.pricing_mode === "quote"
            ? `${offering.name} needs flat-quote pricing enabled.`
            : `${offering.name} needs a valid hourly rate.`,
        actionable: true,
      });
    }
    if (!offering.service_is_live) {
      pricing.push({
        key: `live:${offering.id}`,
        message: `${offering.name} isn't live on the marketplace yet. We'll turn it on; nothing for you to do.`,
        actionable: false,
      });
    }
  }

  const payouts: ReadinessIssue[] = [];
  if (
    profile.onboarding_submitted_at &&
    profile.verification_status !== "rejected" &&
    !isPayoutsActive(profile)
  ) {
    payouts.push({
      key: "payouts",
      message: profile.stripe_account_id
        ? "Stripe still needs a few details before payouts turn on."
        : "Connect Stripe to receive payouts.",
      actionable: true,
    });
  }

  const legal: ReadinessIssue[] = [];
  if (!providerTermsAccepted) {
    legal.push({
      key: "provider_terms",
      message: "Review and accept the provider agreement.",
      actionable: true,
    });
  }

  return {
    storefront: [],
    availability,
    pricing,
    payouts,
    account: [],
    // Only reachable by accounts that don't provide yet, so never in play here.
    "become-provider": [],
    legal,
    delete: [],
  };
}

/** Sidebar badge number: only what the provider can personally resolve. */
export function badgeCount(issues: readonly ReadinessIssue[] | undefined) {
  return (issues ?? []).filter((issue) => issue.actionable).length;
}
