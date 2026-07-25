import { AvailabilityOverridesEditor } from "@/app/(provider)/provider/_components/availability-overrides-editor";
import { ProviderAvailabilityForm } from "@/app/(provider)/provider/_components/provider-availability-form";
import type { ProviderProfile } from "@/lib/db/types";
import type {
  getProviderAvailabilityOverrides,
  ProviderSchedule,
} from "@/lib/db/queries";
import type { ReadinessIssue } from "@/lib/provider/settings-readiness";
import type { AvailabilityWindow } from "@/lib/provider/setup";

import { PanelNotices } from "../_components/panel-notices";
import { Section } from "../_components/section";
import { saveAvailabilityOverride, updateAvailability } from "../provider-actions";

export function AvailabilityPanel({
  providerProfile,
  windows,
  schedule,
  overrides,
  issues,
}: {
  providerProfile: ProviderProfile;
  windows: AvailabilityWindow[];
  /** Null only when Supabase env vars are missing (skeleton rendering). */
  schedule: ProviderSchedule | null;
  overrides: Awaited<ReturnType<typeof getProviderAvailabilityOverrides>>;
  issues: readonly ReadinessIssue[];
}) {
  return (
    <>
      <PanelNotices issues={issues} />

      <Section
        title="Your usual week"
        description="Drag the hours you work on the rail. Group days that share the same hours, plus private matching details."
      >
        <ProviderAvailabilityForm
          values={{ ...providerProfile, windows }}
          action={updateAvailability}
          submitLabel="Save availability"
        />
      </Section>

      {schedule ? (
        <Section
          title="Specific dates"
          description="Going home for the weekend, or an exam day? Set one date aside without touching your usual week."
        >
          <AvailabilityOverridesEditor
            action={saveAvailabilityOverride}
            nowIso={schedule.nowIso}
            days={schedule.days}
            overrides={overrides}
            busy={schedule.busy}
          />
        </Section>
      ) : null}
    </>
  );
}
