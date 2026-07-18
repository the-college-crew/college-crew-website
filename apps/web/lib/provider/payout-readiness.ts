import "server-only";

import type { ProviderProfile } from "@/lib/db/types";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProviderPayoutStatus } from "@/lib/stripe/connect";

/**
 * Refresh the persisted Accounts v2 recipient capability snapshot. Callers
 * must first prove the provider belongs to the current user or that the caller
 * is an admin; this helper never accepts a browser-supplied account id.
 */
export async function syncProviderPayoutSnapshot(
  profile: Pick<ProviderProfile, "id" | "stripe_account_id">,
) {
  if (!profile.stripe_account_id) {
    return { configured: true as const, transfersActive: false };
  }

  const payout = await getProviderPayoutStatus(profile.stripe_account_id);
  if (!payout.configured) return payout;

  const checkedAt = new Date().toISOString();
  const admin = createAdminClient();
  const { error } = await admin
    .from("provider_profiles")
    .update({
      stripe_transfers_active: payout.transfersActive,
      stripe_transfers_checked_at: checkedAt,
    })
    .eq("id", profile.id)
    .eq("stripe_account_id", profile.stripe_account_id);
  if (error) throw new Error("Could not save Stripe payout readiness.");

  return { ...payout, checkedAt };
}
