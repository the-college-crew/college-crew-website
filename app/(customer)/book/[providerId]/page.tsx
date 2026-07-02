import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { VerifiedBadge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { getSession } from "@/lib/auth/session";
import { getPublicProviderProfile } from "@/lib/db/queries";

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

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <PageHeader
        eyebrow="Booking request"
        title={provider.display_name || "Request booking"}
        description={
          <span className="inline-flex items-center gap-2">
            <VerifiedBadge />
          </span>
        }
      />

      {session && session.profile.role !== "customer" ? (
        <Card className="p-6 text-sm text-ink-soft">
          <p>
            You&apos;re signed in as a{" "}
            {session.profile.role === "admin" ? "founder" : "provider"} —
            booking requests come from customer accounts.
          </p>
        </Card>
      ) : (
        <Card pennant className="p-6">
          <BookingRequestForm
            providerId={provider.id}
            services={provider.services}
          />
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
