import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { VerifiedBadge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { getSession } from "@/lib/auth/session";
import { getPublicProviderProfile } from "@/lib/db/queries";
import {
  areBookingRequestsEnabled,
  isHourlyBookingEnabled,
} from "@/lib/env";

import { BookingRequestForm } from "./booking-form";

export const metadata: Metadata = { title: "Request booking" };

export default async function BookingPage({
  params,
}: {
  params: Promise<{ providerId: string }>;
}) {
  const { providerId } = await params;
  const [provider, session] = await Promise.all([
    getPublicProviderProfile(providerId),
    getSession(),
  ]);
  if (!provider) notFound();
  const requestsEnabled =
    isHourlyBookingEnabled() && areBookingRequestsEnabled();
  const bookableServices = provider.services.filter(
    (offering) => offering.is_hourly_bookable,
  );
  const defaultAddress = session
    ? [
        session.profile.address_line1,
        session.profile.address_line2,
        [session.profile.city, session.profile.state]
          .filter(Boolean)
          .join(", "),
      ]
        .filter(Boolean)
        .join(", ")
    : "";
  const defaultJobZip = session?.profile.postal_code ?? "";

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <PageHeader
        title={provider.display_name || "Request booking"}
        description={
          <span className="inline-flex items-center gap-2">
            <VerifiedBadge />
          </span>
        }
      />

      {!requestsEnabled ? (
        <Card className="p-6 text-sm text-ink-soft">
          <p className="font-semibold text-ink">Hourly booking opens soon.</p>
          <p className="mt-1">
            Provider setup is underway, but customer requests remain disabled
            until the guarded hourly request flow is ready.
          </p>
        </Card>
      ) : !session ? (
        <Card className="p-6 text-sm text-ink-soft">
          <p className="font-semibold text-ink">Log in to send this request.</p>
          <Link
            href={`/login?next=${encodeURIComponent(`/book/${provider.id}`)}`}
            className={buttonClasses({ size: "sm", className: "mt-4" })}
          >
            Log in
          </Link>
        </Card>
      ) : session.profile.role !== "customer" ? (
        <Card className="p-6 text-sm text-ink-soft">
          <p>
            You&apos;re signed in as a{" "}
            {session.profile.role === "admin" ? "founder" : "provider"} —
            booking requests come from customer accounts.
          </p>
        </Card>
      ) : bookableServices.length > 0 ? (
        <Card pennant className="p-6">
          <BookingRequestForm
            services={bookableServices}
            defaultAddress={defaultAddress}
            defaultJobZip={defaultJobZip}
          />
        </Card>
      ) : (
        <Card className="p-6 text-sm text-ink-soft">
          This provider is still completing hourly booking setup.
        </Card>
      )}

      <p className="text-center text-sm">
        <Link
          href={`/providers/${provider.id}`}
          className={buttonClasses({ variant: "ghost", size: "sm" })}
        >
          ← Back to profile
        </Link>
      </p>
    </div>
  );
}
