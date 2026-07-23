import {
  connectStripe,
  refreshStripeReadiness,
} from "@/app/(provider)/provider/actions";
import { FormLoader } from "@/components/form-loader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ProviderProfile } from "@/lib/db/types";
import type { ReadinessIssue } from "@/lib/provider/settings-readiness";

import { PanelNotices } from "../_components/panel-notices";
import { Section } from "../_components/section";

export function PayoutsPanel({
  providerProfile,
  issues,
  stripeConnected,
  stripeIncomplete,
}: {
  providerProfile: ProviderProfile;
  issues: readonly ReadinessIssue[];
  stripeConnected: boolean;
  stripeIncomplete: boolean;
}) {
  const payoutsActive = providerProfile.stripe_transfers_active;

  return (
    <>
      {stripeConnected ? (
        <div className="rounded-lg border border-quad-200 bg-quad-50 p-4 text-sm text-quad-800">
          Stripe onboarding finished. Payouts will land in your bank account.
        </div>
      ) : null}
      {stripeIncomplete ? (
        <div className="rounded-lg border border-gold-300 bg-gold-100 p-4 text-sm text-gold-800">
          Stripe still needs information before payouts can turn on. Resume
          onboarding below after reviewing any Stripe requirements.
        </div>
      ) : null}

      <PanelNotices issues={issues} />

      <Section title="Payouts">
        {providerProfile.verification_status !== "approved" ? (
          <p className="text-sm text-ink-soft">
            Stripe unlocks after your ID is approved. Hang tight.
          </p>
        ) : providerProfile.stripe_account_id && payoutsActive ? (
          <div className="flex items-center gap-3">
            <Badge tone="green">✓ Payouts active</Badge>
            <span className="text-xs text-mist">
              Account {providerProfile.stripe_account_id.slice(0, 8)}…
            </span>
          </div>
        ) : providerProfile.stripe_account_id ? (
          <div className="flex flex-wrap items-center gap-3">
            <Badge tone="gold">Finish Stripe setup</Badge>
            <form action={connectStripe}>
              <FormLoader />
              <Button type="submit" size="sm" variant="secondary">
                Resume onboarding
              </Button>
            </form>
            <form action={refreshStripeReadiness}>
              <Button type="submit" size="sm" variant="ghost">
                Refresh status
              </Button>
            </form>
            <span className="text-xs text-mist">
              A few details are still needed before payouts turn on.
            </span>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <form action={connectStripe}>
              <FormLoader />
              <Button type="submit" size="sm">
                Connect Stripe
              </Button>
            </form>
            <span className="text-xs text-mist">
              Hosted by Stripe; we never see your bank details.
            </span>
          </div>
        )}
      </Section>
    </>
  );
}
