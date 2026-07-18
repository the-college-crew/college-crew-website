import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ProviderProfile } from "@/components/provider-profile";
import { getSession } from "@/lib/auth/session";
import { getPublicProviderProfile } from "@/lib/db/queries";
import {
  getBookingFrom,
  resolveBookingOrigin,
} from "@/lib/location/booking-from";

export const metadata: Metadata = { title: "Provider profile" };

export default async function ProviderProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [session, bookingFrom] = await Promise.all([
    getSession(),
    getBookingFrom(),
  ]);
  const origin = resolveBookingOrigin(bookingFrom, session?.profile ?? null);
  const provider = await getPublicProviderProfile(
    id,
    origin.isSet
      ? { latitude: origin.latitude, longitude: origin.longitude }
      : null,
  );

  if (!provider) notFound();

  return (
    <div className="mx-auto max-w-3xl">
      <ProviderProfile provider={provider} />
    </div>
  );
}
