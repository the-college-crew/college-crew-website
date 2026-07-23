import { ProviderAvailabilityForm } from "@/app/(provider)/provider/_components/provider-availability-form";
import type { ProviderProfile } from "@/lib/db/types";
import type { ReadinessIssue } from "@/lib/provider/settings-readiness";
import type { AvailabilityWindow } from "@/lib/provider/setup";

import { PanelNotices } from "../_components/panel-notices";
import { Section } from "../_components/section";
import { updateAvailability } from "../provider-actions";

export function AvailabilityPanel({
  providerProfile,
  windows,
  issues,
}: {
  providerProfile: ProviderProfile;
  windows: AvailabilityWindow[];
  issues: readonly ReadinessIssue[];
}) {
  return (
    <>
      <PanelNotices issues={issues} />

      <Section
        title="Availability"
        description="Set Central Time hours per day. Group days that share the same hours, plus private matching details."
      >
        <ProviderAvailabilityForm
          values={{ ...providerProfile, windows }}
          action={updateAvailability}
          submitLabel="Save availability"
        />
      </Section>
    </>
  );
}
