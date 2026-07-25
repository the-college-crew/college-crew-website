import type { Metadata } from "next";
import { redirect } from "next/navigation";

import type { Offering } from "@/app/(provider)/provider/_components/services-pricing-form";
import { SamplePreviewBanner } from "@/components/sample-preview-banner";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { getOwnProviderProfile, getSession, requireUser } from "@/lib/auth/session";
import {
  getProviderAvailabilityOverrides,
  getProviderAvailabilityWindows,
  getProviderSchedule,
  type ProviderSchedule,
} from "@/lib/db/queries";
import {
  demoAvailabilityWindows,
  demoOfferings,
  demoProviderProfile,
  demoServices,
  getDemoPreview,
} from "@/lib/demo/sample-preview";
import { hasAcceptedCurrentLegalDocument } from "@/lib/legal/acceptance";
import {
  emptySettingsReadiness,
  getSettingsReadiness,
  type SettingsTabId,
} from "@/lib/provider/settings-readiness";
import {
  formatAvailabilityDays,
  formatAvailabilityWindow,
  groupAvailabilityWindows,
  type AvailabilityWindow,
} from "@/lib/provider/setup";
import { createClient } from "@/lib/supabase/server";
import { formatOfferedPrice } from "@/lib/utils";

import { Section } from "./_components/section";
import { SettingsNav } from "./_components/settings-nav";
import { resolveSettingsTab, visibleSettingsTabs } from "./_components/tabs";
import { AccountPanel } from "./_panels/account-panel";
import { AvailabilityPanel } from "./_panels/availability-panel";
import { BecomeProviderPanel } from "./_panels/become-provider-panel";
import { DeletePanel } from "./_panels/delete-panel";
import { LegalPanel } from "./_panels/legal-panel";
import { PayoutsPanel } from "./_panels/payouts-panel";
import { PricingPanel } from "./_panels/pricing-panel";
import { StorefrontPanel } from "./_panels/storefront-panel";

export const metadata: Metadata = { title: "Account settings" };

/** Two-column settings shell: category rail plus the one active panel. */
function SettingsLayout({
  description,
  nav,
  children,
}: {
  description: string;
  nav: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8">
      <PageHeader title="Account settings" description={description} />
      <div className="mt-8 grid gap-6 md:grid-cols-[13rem_minmax(0,1fr)] md:gap-10">
        <div className="md:sticky md:top-24 md:self-start">{nav}</div>
        <div className="min-w-0 space-y-6">{children}</div>
      </div>
    </div>
  );
}

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ stripe?: string; tab?: string }>;
}) {
  const [{ stripe, tab }] = await Promise.all([
    searchParams,
    requireUser("/account"),
  ]);

  // Admin previewing "as provider" via view-as → sample storefront, no real
  // personal/delete controls (those would act on the admin's own account).
  const demoPreview = await getDemoPreview("provider");
  if (demoPreview) return <ProviderAccountDemo tab={tab} />;

  const session = await getSession();
  if (!session) redirect("/login?next=/account");
  const { profile, user } = session;

  // Provider panels render for any account that has started providing (owns a
  // provider profile). Everyone gets Account, Legal, and Delete.
  const providerProfile = await getOwnProviderProfile();
  const isProvider = Boolean(providerProfile);
  const isAdmin = profile.role === "admin";

  const supabase = await createClient();
  const [platformTermsAccepted, customerTermsAccepted, providerTermsAccepted] =
    isAdmin
      ? [true, true, true]
      : await Promise.all([
          hasAcceptedCurrentLegalDocument(supabase, {
            userId: user.id,
            kind: "platform_terms",
          }),
          hasAcceptedCurrentLegalDocument(supabase, {
            userId: user.id,
            kind: "customer_booking_terms",
          }),
          providerProfile
            ? hasAcceptedCurrentLegalDocument(supabase, {
                userId: user.id,
                kind: "provider_terms",
              })
            : Promise.resolve(false),
        ]);

  // Badge counts need offerings + windows regardless of which tab is open, so
  // they're fetched once here and handed to both the rail and the panel that
  // uses them. Only the live service catalog is deferred to its own panel.
  let offerings: Offering[] = [];
  let windows: AvailabilityWindow[] = [];
  let schedule: ProviderSchedule | null = null;
  let overrides: Awaited<ReturnType<typeof getProviderAvailabilityOverrides>> = [];
  let readiness = emptySettingsReadiness();

  if (providerProfile) {
    const [{ data }, providerWindows, providerSchedule, providerOverrides] =
      await Promise.all([
      supabase
        .from("provider_services")
        .select(
          "id, service_id, price_cents, price_type, unit, hourly_rate_cents, pricing_mode, average_quote_cents, service:services(name, slug, is_live)",
        )
        .eq("provider_id", providerProfile.id),
      getProviderAvailabilityWindows(providerProfile.id),
      getProviderSchedule(providerProfile.id, { days: 364 }),
      getProviderAvailabilityOverrides(providerProfile.id),
    ]);

    const rows = data ?? [];
    offerings = rows;
    windows = providerWindows;
    schedule = providerSchedule;
    overrides = providerOverrides;
    readiness = getSettingsReadiness({
      profile: providerProfile,
      offerings: rows.map((offering) => ({
        id: offering.id,
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
  }

  // Founder accounts don't onboard as providers (requireOnboardingUser sends
  // them home), so the invitation would be a dead end for them.
  const tabs = visibleSettingsTabs(isProvider, isAdmin ? ["become-provider"] : []);
  // A Stripe round-trip lands on Payouts so its result banner is actually seen.
  const stripeReturn = stripe === "connected" || stripe === "incomplete";
  const activeTab = resolveSettingsTab(
    stripeReturn && isProvider ? "payouts" : tab,
    tabs,
  );

  return (
    <SettingsLayout
      description={
        isProvider
          ? "Your storefront, availability, pricing (the source of truth), and account."
          : "Manage your profile, password, and account."
      }
      nav={
        <SettingsNav activeTab={activeTab} tabs={tabs} readiness={readiness} />
      }
    >
      {providerProfile && activeTab === "storefront" ? (
        <StorefrontPanel providerProfile={providerProfile} />
      ) : null}

      {providerProfile && activeTab === "availability" ? (
        <AvailabilityPanel
          providerProfile={providerProfile}
          windows={windows}
          schedule={schedule}
          overrides={overrides}
          issues={readiness.availability}
        />
      ) : null}

      {providerProfile && activeTab === "pricing" ? (
        <PricingPanel offerings={offerings} issues={readiness.pricing} />
      ) : null}

      {providerProfile && activeTab === "payouts" ? (
        <PayoutsPanel
          providerProfile={providerProfile}
          issues={readiness.payouts}
          stripeConnected={stripe === "connected"}
          stripeIncomplete={stripe === "incomplete"}
        />
      ) : null}

      {activeTab === "account" ? (
        <AccountPanel profile={profile} email={user.email ?? ""} />
      ) : null}

      {activeTab === "become-provider" ? <BecomeProviderPanel /> : null}

      {activeTab === "legal" ? (
        <LegalPanel
          isAdmin={isAdmin}
          isProvider={isProvider}
          platformTermsAccepted={platformTermsAccepted}
          customerTermsAccepted={customerTermsAccepted}
          providerTermsAccepted={providerTermsAccepted}
          issues={readiness.legal}
        />
      ) : null}

      {activeTab === "delete" ? <DeletePanel /> : null}
    </SettingsLayout>
  );
}

/**
 * Admin "view as provider" preview. Same rail, sample data, every control
 * inert — and no Legal/Delete tabs, since those would act on the admin's own
 * account rather than the sample one.
 */
function ProviderAccountDemo({ tab }: { tab?: string }) {
  const tabs = visibleSettingsTabs(true, ["legal", "delete"]);
  const activeTab: SettingsTabId = resolveSettingsTab(tab, tabs);
  const availabilityGroups = groupAvailabilityWindows(demoAvailabilityWindows);

  return (
    <SettingsLayout
      description="Your storefront, availability, pricing (the source of truth), and account."
      nav={
        <SettingsNav
          activeTab={activeTab}
          tabs={tabs}
          readiness={emptySettingsReadiness()}
        />
      }
    >
      <SamplePreviewBanner role="provider" />

      {activeTab === "storefront" ? (
        <Section
          title="Public profile"
          description="What neighbors see on Browse and your profile page."
        >
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-mist">Display name</dt>
              <dd className="font-medium">{demoProviderProfile.display_name}</dd>
            </div>
            <div>
              <dt className="text-mist">Provider type</dt>
              <dd className="font-medium">Student business</dd>
            </div>
            <div>
              <dt className="text-mist">Neighborhood</dt>
              <dd className="font-medium">{demoProviderProfile.neighborhood}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-mist">Bio</dt>
              <dd className="font-medium">{demoProviderProfile.bio}</dd>
            </div>
          </dl>
        </Section>
      ) : null}

      {activeTab === "availability" ? (
        <Section
          title="Availability"
          description="Shown on your public profile so customers request times that work."
        >
          {availabilityGroups.map((group) => (
            <p key={`${group.start}-${group.end}`} className="font-medium">
              {formatAvailabilityDays(group.weekdays)} ·{" "}
              {formatAvailabilityWindow(group.start, group.end)}
            </p>
          ))}
          <p className="mt-3 text-sm text-ink-soft">
            {demoProviderProfile.availability_note}
          </p>
          <p className="mt-2 text-xs text-mist">
            {demoProviderProfile.minimum_notice_hours} hours minimum notice ·
            service ZIP stays private
          </p>
        </Section>
      ) : null}

      {activeTab === "pricing" ? (
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
      ) : null}

      {activeTab === "payouts" ? (
        <Section title="Payouts">
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" size="sm" disabled>
              Connect Stripe
            </Button>
            <span className="text-xs text-mist">
              Disabled in sample mode; real providers connect after approval.
            </span>
          </div>
        </Section>
      ) : null}

      {activeTab === "account" ? (
        <Section title="Personal details">
          <dl className="mb-5 text-sm">
            <div className="flex justify-between gap-4 border-b border-line py-2.5">
              <dt className="text-mist">Email</dt>
              <dd className="font-medium">avery.student@example.edu</dd>
            </div>
          </dl>
          <Button type="button" size="sm" disabled>
            Update password
          </Button>
        </Section>
      ) : null}
    </SettingsLayout>
  );
}
