import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import {
  connectStripe,
  refreshStripeReadiness,
} from "@/app/(provider)/provider/actions";
import { ServicesPricingForm } from "@/app/(provider)/provider/_components/services-pricing-form";
import { ProviderAvailabilityForm } from "@/app/(provider)/provider/_components/provider-availability-form";
import { FormLoader } from "@/components/form-loader";
import { ProviderReadinessChecklist } from "@/components/provider-readiness-checklist";
import { SamplePreviewBanner } from "@/components/sample-preview-banner";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import {
  getOwnProviderProfile,
  getSession,
  requireUser,
} from "@/lib/auth/session";
import {
  getLiveServices,
  getProviderAvailabilityWindows,
} from "@/lib/db/queries";
import {
  demoAvailabilityWindows,
  demoOfferings,
  demoProviderProfile,
  demoServices,
  getDemoPreview,
} from "@/lib/demo/sample-preview";
import { createClient } from "@/lib/supabase/server";
import { formatOfferedPrice } from "@/lib/utils";

import { AccountPasswordForm, AccountProfileForm } from "./account-forms";
import { AvatarUploadForm } from "./avatar-upload-form";
import { BannerUploadForm } from "./banner-upload-form";
import {
  saveSettingsPricing,
  updateAvailability,
} from "./provider-actions";
import { ProviderProfileForm } from "./provider-settings-forms";
import { providerAvatarUrl } from "@/lib/media/provider-avatars";
import { toBannerStyle } from "@/lib/media/provider-banners";
import {
  formatAvailabilityDays,
  formatAvailabilityWindow,
  groupAvailabilityWindows,
} from "@/lib/provider/setup";

export const metadata: Metadata = { title: "Account settings" };

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
      <h2 className="font-display text-xl font-semibold">{title}</h2>
      {description ? (
        <p className="mt-1 text-sm text-ink-soft">{description}</p>
      ) : null}
      <div className="mt-5">{children}</div>
    </Card>
  );
}

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ stripe?: string }>;
}) {
  const [{ stripe }] = await Promise.all([
    searchParams,
    requireUser("/account"),
  ]);

  // Admin previewing "as provider" via view-as → sample storefront, no real
  // personal/delete controls (those would act on the admin's own account).
  const demoPreview = await getDemoPreview("provider");
  if (demoPreview) return <ProviderAccountDemo />;

  const session = await getSession();
  if (!session) redirect("/login?next=/account");
  const { profile, user } = session;

  // Provider storefront sections render only for a real provider who has
  // finished creating their provider profile. Mid-onboarding providers still
  // get the personal/security/delete controls below.
  const providerProfile =
    profile.role === "provider" ? await getOwnProviderProfile() : null;

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 px-4 py-8">
      <PageHeader
        title="Account settings"
        description={
          providerProfile
            ? "Your storefront, availability, pricing (the source of truth), and account."
            : "Manage your profile, password, and account."
        }
      />

      {providerProfile ? (
        <ProviderStorefront
          providerProfile={providerProfile}
          stripeConnected={stripe === "connected"}
          stripeIncomplete={stripe === "incomplete"}
        />
      ) : null}

      <Section
        title="Personal details"
        description="Your name and address. Address helps us match you with nearby neighbors."
      >
        <dl className="mb-5 text-sm">
          <div className="flex justify-between gap-4 border-b border-line py-2.5">
            <dt className="text-mist">Email</dt>
            <dd className="font-medium">{user.email}</dd>
          </div>
        </dl>
        <AccountProfileForm profile={profile} />
      </Section>

      <Section title="Security" description="Change your password.">
        <AccountPasswordForm />
      </Section>

      <Section
        title="Delete account"
        description="Permanently remove your account and all associated data. This can't be undone."
      >
        <Link
          href="/account/delete"
          className={buttonClasses({ variant: "danger", size: "sm" })}
        >
          Delete my account
        </Link>
      </Section>
    </div>
  );
}

/**
 * Provider storefront sections (public profile, availability, pricing, payouts)
 * rendered above the personal/account controls on the unified /account page.
 */
async function ProviderStorefront({
  providerProfile,
  stripeConnected,
  stripeIncomplete,
}: {
  providerProfile: NonNullable<Awaited<ReturnType<typeof getOwnProviderProfile>>>;
  stripeConnected: boolean;
  stripeIncomplete: boolean;
}) {
  const supabase = await createClient();
  const [services, { data: offerings }, windows] = await Promise.all([
    getLiveServices(),
    supabase
      .from("provider_services")
      .select(
        "id, service_id, price_cents, price_type, unit, hourly_rate_cents, service:services(name, is_live)",
      )
      .eq("provider_id", providerProfile.id),
    getProviderAvailabilityWindows(providerProfile.id),
  ]);
  const readinessOfferings = (offerings ?? []).map((offering) => ({
    id: offering.id,
    name: offering.service?.name ?? "Retired service",
    hourly_rate_cents: offering.hourly_rate_cents,
    service_is_live: offering.service?.is_live === true,
  }));

  const payoutsActive = providerProfile.stripe_transfers_active;

  return (
    <>
      {stripeConnected ? (
        <div className="rounded-lg border border-quad-200 bg-quad-50 p-4 text-sm text-quad-800">
          Stripe onboarding finished — payouts will land in your bank account.
        </div>
      ) : null}
      {stripeIncomplete ? (
        <div className="rounded-lg border border-gold-300 bg-gold-100 p-4 text-sm text-gold-800">
          Stripe still needs information before payouts can turn on. Resume
          onboarding below after reviewing any Stripe requirements.
        </div>
      ) : null}

      <ProviderReadinessChecklist
        profile={providerProfile}
        offerings={readinessOfferings}
        windows={windows}
      />

      <Section
        title="Profile photo"
        description="Your public headshot on Browse and your profile. Required to stay visible to neighbors."
      >
        <AvatarUploadForm
          imageUrl={providerAvatarUrl(providerProfile.avatar_image_path)}
        />
      </Section>

      <Section
        title="Profile banner"
        description="The wide banner behind your headshot on Browse and your profile. Pick a theme or upload your own photo."
      >
        <BannerUploadForm
          imagePath={providerProfile.banner_image_path}
          activeStyle={toBannerStyle(providerProfile.banner_style)}
        />
      </Section>

      <Section
        title="Public profile"
        description="What neighbors see on Browse and your profile page."
      >
        <ProviderProfileForm profile={providerProfile} />
      </Section>

      <Section
        title="Availability"
        description="Set Central Time hours per day — group days that share the same hours, plus private matching details."
      >
        <ProviderAvailabilityForm
          values={{ ...providerProfile, windows }}
          action={updateAvailability}
          submitLabel="Save availability"
        />
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
        {providerProfile.verification_status !== "approved" ? (
          <p className="text-sm text-ink-soft">
            Stripe unlocks after your ID is approved — hang tight.
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
              Hosted by Stripe — we never see your bank details.
            </span>
          </div>
        )}
      </Section>
    </>
  );
}

function ProviderAccountDemo() {
  const availabilityGroups = groupAvailabilityWindows(demoAvailabilityWindows);

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 px-4 py-8">
      <PageHeader
        title="Account settings"
        description="Your storefront, availability, pricing (the source of truth), and account."
      />
      <SamplePreviewBanner role="provider" />

      <ProviderReadinessChecklist
        profile={demoProviderProfile}
        offerings={demoOfferings.map((offering) => ({
          id: offering.id,
          name: offering.service.name,
          hourly_rate_cents: offering.hourly_rate_cents,
          service_is_live: offering.service.is_live,
        }))}
        windows={demoAvailabilityWindows}
      />

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
    </div>
  );
}
