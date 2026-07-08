import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { SamplePreviewBanner } from "@/components/sample-preview-banner";
import { getOwnProviderProfile, requireRole } from "@/lib/auth/session";
import {
  demoOfferings,
  demoProviderProfile,
  demoServices,
  getDemoPreview,
} from "@/lib/demo/sample-preview";
import { getLiveServices } from "@/lib/db/queries";
import { createClient } from "@/lib/supabase/server";
import { formatOfferedPrice } from "@/lib/utils";

import { connectStripe, requestBackgroundCheck } from "../actions";
import { ServicesPricingForm } from "../_components/services-pricing-form";
import { saveSettingsPricing } from "./actions";
import { AvailabilityForm, PasswordForm, ProfileForm } from "./settings-forms";

export const metadata: Metadata = { title: "Profile & settings" };

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="p-6">
      <h2 className="font-display text-xl font-semibold">
        {title}
      </h2>
      {description ? (
        <p className="mt-1 text-sm text-ink-soft">{description}</p>
      ) : null}
      <div className="mt-5">{children}</div>
    </Card>
  );
}

export default async function ProviderSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ stripe?: string; bgc?: string }>;
}) {
  const [{ stripe, bgc }, session] = await Promise.all([
    searchParams,
    requireRole("provider", "/provider/settings"),
  ]);
  const demoPreview = await getDemoPreview("provider");
  if (demoPreview) {
    return <ProviderSettingsDemo />;
  }

  const profile = await getOwnProviderProfile();
  if (!profile) redirect("/provider/onboarding/account");

  const supabase = await createClient();
  const [services, { data: offerings }] = await Promise.all([
    getLiveServices(),
    supabase
      .from("provider_services")
      .select("service_id, price_cents, price_type, unit")
      .eq("provider_id", profile.id),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Profile & settings"
        description="Your storefront, availability, pricing (the source of truth), and account."
      />

      {stripe === "connected" ? (
        <div className="rounded-lg border border-quad-200 bg-quad-50 p-4 text-sm text-quad-800">
          Stripe onboarding finished — payouts will land in your bank account.
        </div>
      ) : null}
      {bgc === "requested" ? (
        <div className="rounded-lg border border-quad-200 bg-quad-50 p-4 text-sm text-quad-800">
          Background check requested — a founder will follow up with next
          steps.
        </div>
      ) : null}
      {bgc === "unavailable" ? (
        <div className="rounded-lg border border-gold-400/60 bg-gold-100 p-4 text-sm text-gold-800">
          Background checks aren&apos;t available yet in this environment.
        </div>
      ) : null}

      <Section
        title="Public profile"
        description="What neighbors see on Browse and your profile page."
      >
        <ProfileForm profile={profile} />
      </Section>

      <Section
        title="Availability"
        description="Shown on your public profile so customers request times that work."
      >
        <AvailabilityForm profile={profile} />
      </Section>

      <Section
        title="Services & pricing"
        description="The source of truth — your public profile and the Jobs page both read from here."
      >
        <ServicesPricingForm
          services={services}
          offerings={offerings ?? []}
          action={saveSettingsPricing}
          submitLabel="Save pricing"
        />
      </Section>

      <Section title="Payouts">
        {profile.verification_status !== "approved" ? (
          <p className="text-sm text-ink-soft">
            Stripe unlocks after your ID is approved — hang tight.
          </p>
        ) : profile.stripe_account_id ? (
          <div className="flex items-center gap-3">
            <Badge tone="green">✓ Stripe connected</Badge>
            <span className="text-xs text-mist">
              Account {profile.stripe_account_id.slice(0, 8)}…
            </span>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <form action={connectStripe}>
              <Button type="submit" size="sm">
                Connect Stripe
              </Button>
            </form>
            <span className="text-xs text-mist">
              Hosted by Stripe — we never see your bank details.
            </span>
          </div>
        )}
      </Section>

      <Section
        title="Background check"
        description="Optional — adds a trust badge customers see everywhere your name appears."
      >
        {profile.background_check_status === "passed" ? (
          <Badge tone="green">✓ Background checked</Badge>
        ) : profile.background_check_status === "pending" ? (
          <Badge tone="gold">Background check pending</Badge>
        ) : (
          <form action={requestBackgroundCheck}>
            <Button type="submit" variant="secondary" size="sm">
              Request a background check
            </Button>
          </form>
        )}
      </Section>

      <Section title="Account">
        <dl className="mb-5 text-sm">
          <div className="flex justify-between gap-4 border-b border-line py-2.5">
            <dt className="text-mist">School email</dt>
            <dd className="font-medium">{session.user.email}</dd>
          </div>
        </dl>
        <PasswordForm />
      </Section>
    </div>
  );
}

function ProviderSettingsDemo() {
  const availability = demoProviderProfile.availability as {
    days?: string[];
    note?: string;
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Profile & settings"
        description="Your storefront, availability, pricing (the source of truth), and account."
      />
      <SamplePreviewBanner role="provider" />

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

      <Section
        title="Availability"
        description="Shown on your public profile so customers request times that work."
      >
        <div className="flex flex-wrap gap-2">
          {(availability.days ?? []).map((day) => (
            <span
              key={day}
              className="rounded-full border border-quad-200 bg-quad-50 px-3 py-1 text-xs font-semibold uppercase text-quad-800"
            >
              {day}
            </span>
          ))}
        </div>
        <p className="mt-3 text-sm text-ink-soft">{availability.note}</p>
      </Section>

      <Section
        title="Services & pricing"
        description="The source of truth — your public profile and the Jobs page both read from here."
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

      <Section title="Payouts">
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" size="sm" disabled>
            Connect Stripe
          </Button>
          <span className="text-xs text-mist">
            Disabled in sample mode — real providers connect after approval.
          </span>
        </div>
      </Section>

      <Section
        title="Background check"
        description="Optional — adds a trust badge customers see everywhere your name appears."
      >
        <Badge tone="green">✓ Background checked</Badge>
      </Section>

      <Section title="Account">
        <dl className="mb-5 text-sm">
          <div className="flex justify-between gap-4 border-b border-line py-2.5">
            <dt className="text-mist">School email</dt>
            <dd className="font-medium">avery.student@example.edu</dd>
          </div>
        </dl>
        <Button type="button" size="sm" disabled>
          Update password
        </Button>
      </Section>
    </div>
  );
}
