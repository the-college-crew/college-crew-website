import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { BookingFrom } from "@/components/booking-from";
import { LocationLine } from "@/components/provider-card";
import { VerifiedBadge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { getOwnProviderProfile, getSession } from "@/lib/auth/session";
import { getPublicProviderProfile } from "@/lib/db/queries";
import {
  areBookingRequestsEnabled,
  isHourlyBookingEnabled,
} from "@/lib/env";
import {
  buildBookingFromSummary,
  getBookingFrom,
  resolveBookingOrigin,
} from "@/lib/location/booking-from";

import { BookingRequestForm } from "./booking-form";

export const metadata: Metadata = { title: "Request booking" };

export default async function BookingPage({
  params,
}: {
  params: Promise<{ providerId: string }>;
}) {
  const { providerId } = await params;
  const [session, bookingFrom] = await Promise.all([
    getSession(),
    getBookingFrom(),
  ]);
  const origin = resolveBookingOrigin(bookingFrom, session?.profile ?? null);
  const provider = await getPublicProviderProfile(
    providerId,
    origin.isSet
      ? { latitude: origin.latitude, longitude: origin.longitude }
      : null,
  );
  if (!provider) notFound();
  const requestsEnabled =
    isHourlyBookingEnabled() && areBookingRequestsEnabled();
  const bookableServices = provider.services.filter(
    (offering) => offering.is_hourly_bookable,
  );

  // Providers can book other providers, but never their own listing; admin
  // (founder) accounts don't book at all. Both rules are enforced again in
  // the database — this is just the friendly surface.
  const ownProviderProfile = session ? await getOwnProviderProfile() : null;
  const isOwnListing = ownProviderProfile?.id === provider.id;
  const isAdmin = session?.profile.role === "admin";

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <PageHeader
        title={provider.display_name || "Request booking"}
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            <VerifiedBadge />
            <LocationLine
              town={provider.town}
              distanceMiles={provider.distance_miles}
            />
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
      ) : isAdmin ? (
        <Card className="p-6 text-sm text-ink-soft">
          <p>
            You&apos;re signed in as a founder. Founder accounts don&apos;t
            send booking requests.
          </p>
        </Card>
      ) : isOwnListing ? (
        <Card className="p-6 text-sm text-ink-soft">
          <p>
            This is your own listing. You can book other providers, but not
            yourself.
          </p>
        </Card>
      ) : bookableServices.length > 0 ? (
        <Card pennant className="p-6">
          <div className="mb-5 border-b border-line pb-5">
            <BookingFrom
              summary={buildBookingFromSummary(bookingFrom, session.profile)}
            />
            {origin.isSet ? (
              <p className="mt-2 text-xs text-mist">{origin.addressLine}</p>
            ) : (
              <p className="mt-2 text-xs font-medium text-red-700">
                Choose where the job is before sending your request.
              </p>
            )}
          </div>
          <BookingRequestForm
            services={bookableServices}
            originReady={origin.isSet}
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
