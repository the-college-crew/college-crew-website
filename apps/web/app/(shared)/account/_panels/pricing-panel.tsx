import {
  ServicesPricingForm,
  type Offering,
} from "@/app/(provider)/provider/_components/services-pricing-form";
import { getLiveServices } from "@/lib/db/queries";
import type { ReadinessIssue } from "@/lib/provider/settings-readiness";

import { PanelNotices } from "../_components/panel-notices";
import { Section } from "../_components/section";
import { saveSettingsPricing } from "../provider-actions";

/** Async: the live service catalog is only needed when this panel is open. */
export async function PricingPanel({
  offerings,
  issues,
}: {
  offerings: Offering[];
  issues: readonly ReadinessIssue[];
}) {
  const services = await getLiveServices();

  return (
    <>
      <PanelNotices issues={issues} />

      <Section
        title="Services & pricing"
        description="The source of truth: your public profile and the Jobs page both read from here."
      >
        <ServicesPricingForm
          services={services}
          offerings={offerings}
          action={saveSettingsPricing}
          submitLabel="Save pricing"
        />
      </Section>
    </>
  );
}
