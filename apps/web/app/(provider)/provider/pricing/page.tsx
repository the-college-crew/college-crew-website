import type { Metadata } from "next";
import { redirect } from "next/navigation";

import type { Offering } from "@/app/(provider)/provider/_components/services-pricing-form";
import { SamplePreviewBanner } from "@/components/sample-preview-banner";
import { Button } from "@/components/ui/button";
import { demoOfferings, demoServices, getDemoPreview } from "@/lib/demo/sample-preview";
import { getProviderAvailabilityWindows } from "@/lib/db/queries";
import { hasAcceptedCurrentLegalDocument } from "@/lib/legal/acceptance";
import { getSettingsReadiness } from "@/lib/provider/settings-readiness";
import {
  getOwnProviderProfile,
  requireProviderAccess,
} from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { formatOfferedPrice } from "@/lib/utils";

import { Section } from "../../../(shared)/account/_components/section";
import { PricingPanel } from "../../../(shared)/account/_panels/pricing-panel";

export const metadata: Metadata = { title: "Services & pricing" };

type OfferingRow = Offering & {
  service: { name: string; slug: string; is_live: boolean } | null;
};

/** Provider work-surface pricing editor. It shares the Account settings panel
 * and Server Action, so both entry points always read and save the same rows. */
export default async function ProviderPricingPage() {
  const [session, demoPreview] = await Promise.all([
    requireProviderAccess("/provider/pricing"),
    getDemoPreview("provider"),
  ]);

  if (demoPreview) return <DemoProviderPricing />;

  const profile = await getOwnProviderProfile();
  if (!profile) redirect("/provider/onboarding/account");

  const supabase = await createClient();
  const [{ data }, windows, providerTermsAccepted] = await Promise.all([
    supabase
      .from("provider_services")
      .select(
        "id, service_id, hourly_rate_cents, pricing_mode, average_quote_cents, service:services(name, slug, is_live)",
      )
      .eq("provider_id", profile.id),
    getProviderAvailabilityWindows(profile.id),
    hasAcceptedCurrentLegalDocument(supabase, {
      userId: session.user.id,
      kind: "provider_terms",
    }),
  ]);

  const offerings = (data ?? []) as OfferingRow[];
  const readiness = getSettingsReadiness({
    profile,
    offerings: offerings.map((offering) => ({
      id: offering.service_id,
      name: offering.service?.name ?? "Retired service",
      hourly_rate_cents: offering.hourly_rate_cents,
      pricing_mode: offering.pricing_mode === "quote" ? "quote" : "hourly",
      average_quote_cents: offering.average_quote_cents,
      service_slug: offering.service?.slug ?? "",
      service_is_live: offering.service?.is_live === true,
    })),
    windows,
    providerTermsAccepted,
  });

  return <PricingPanel offerings={offerings} issues={readiness.pricing} />;
}

function DemoProviderPricing() {
  return (
    <>
      <SamplePreviewBanner role="provider" />
      <Section
        title="Services & pricing"
        description="The source of truth: your public profile and the Jobs page both read from here."
      >
        <ul className="space-y-3">
          {demoServices.map((service) => {
            const offered = demoOfferings.find(
              (offering) => offering.service_id === service.id,
            );

            return (
              <li
                key={service.id}
                className="flex items-center justify-between rounded-lg border border-line bg-paper p-4 text-sm"
              >
                <span className="font-semibold">{service.name}</span>
                <span className="font-semibold text-quad-700">
                  {offered ? formatOfferedPrice(offered) : "Not offered"}
                </span>
              </li>
            );
          })}
        </ul>
        <Button type="button" size="lg" className="mt-4" disabled>
          Save pricing
        </Button>
      </Section>
    </>
  );
}
