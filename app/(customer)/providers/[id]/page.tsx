import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ViewTransition } from "react";

import { Rating } from "@/components/provider-card";
import {
  Badge,
  BackgroundCheckBadge,
  VerifiedBadge,
} from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getPublicProviderProfile } from "@/lib/db/queries";
import { formatDate, formatOfferedPrice } from "@/lib/utils";

export const metadata: Metadata = { title: "Provider profile" };

const DAY_LABELS: Record<string, string> = {
  mon: "Mon",
  tue: "Tue",
  wed: "Wed",
  thu: "Thu",
  fri: "Fri",
  sat: "Sat",
  sun: "Sun",
};

/** Public provider profile — generated from the provider's Profile & settings. */
export default async function ProviderProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const provider = await getPublicProviderProfile(id);
  if (!provider) notFound();

  const days = provider.availability.days ?? [];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Identity — morph target for the Browse card's ViewTransition. */}
      <ViewTransition name={`provider-${provider.id}`} share="morph">
        <Card pennant className="p-6">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-3xl font-semibold">
              {provider.display_name || "Student provider"}
            </h1>
            <VerifiedBadge />
            {provider.background_check_status === "passed" ? (
              <BackgroundCheckBadge />
            ) : null}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <Badge tone={provider.provider_type === "business" ? "blue" : "gray"}>
              {provider.provider_type === "business"
                ? "Student business"
                : "Hardworking individual"}
            </Badge>
            {provider.neighborhood ? (
              <span className="text-xs text-mist">{provider.neighborhood}</span>
            ) : null}
            <Rating rating={provider.rating} />
          </div>
          {provider.bio ? (
            <p className="mt-4 text-sm leading-relaxed text-ink-soft">
              {provider.bio}
            </p>
          ) : null}
          <div className="mt-5">
            <Link
              href={`/book/${provider.id}`}
              className={buttonClasses({ size: "lg" })}
            >
              Request booking
            </Link>
            <p className="mt-2 text-xs text-mist">
              No charge until they accept — you confirm and pay afterward.
            </p>
          </div>
        </Card>
      </ViewTransition>

      {/* Services & pricing */}
      <Card className="p-6">
        <h2 className="font-display text-xl font-semibold">
          Services & pricing
        </h2>
        <ul className="mt-4 divide-y divide-line">
          {provider.services.map((offered) => (
            <li
              key={offered.id}
              className="flex items-center justify-between py-3 text-sm"
            >
              <span className="font-medium">{offered.service.name}</span>
              <span className="font-semibold text-quad-700">
                {formatOfferedPrice(offered)}
              </span>
            </li>
          ))}
        </ul>
      </Card>

      {/* Availability */}
      <Card className="p-6">
        <h2 className="font-display text-xl font-semibold">
          Availability
        </h2>
        {days.length === 0 && !provider.availability.note ? (
          <p className="mt-3 text-sm text-mist">
            Ask about availability when you request a booking.
          </p>
        ) : (
          <>
            {days.length > 0 ? (
              <ul className="mt-3 flex flex-wrap gap-2">
                {days.map((day) => (
                  <li
                    key={day}
                    className="rounded-full border border-quad-200 bg-quad-50 px-3 py-1 text-xs font-semibold text-quad-800"
                  >
                    {DAY_LABELS[day] ?? day}
                  </li>
                ))}
              </ul>
            ) : null}
            {provider.availability.note ? (
              <p className="mt-3 text-sm text-ink-soft">
                {provider.availability.note}
              </p>
            ) : null}
          </>
        )}
      </Card>

      {/* Reviews */}
      <Card className="p-6">
        <h2 className="font-display text-xl font-semibold">
          Reviews
        </h2>
        {provider.reviews.length === 0 ? (
          <p className="mt-3 text-sm text-mist">
            No reviews yet — be their first booking.
          </p>
        ) : (
          <ul className="mt-4 space-y-4">
            {provider.reviews.map((review) => (
              <li key={review.id} className="border-b border-line pb-4 last:border-0">
                <div className="flex items-center gap-2 text-sm">
                  <span aria-label={`${review.rating} out of 5 stars`} className="text-gold-700">
                    {"★".repeat(review.rating)}
                    <span className="text-line">
                      {"★".repeat(5 - review.rating)}
                    </span>
                  </span>
                  {review.service_name ? (
                    <span className="text-xs text-mist">
                      {review.service_name} · {formatDate(review.created_at)}
                    </span>
                  ) : (
                    <span className="text-xs text-mist">
                      {formatDate(review.created_at)}
                    </span>
                  )}
                </div>
                {review.text ? (
                  <p className="mt-1.5 text-sm text-ink-soft">{review.text}</p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
