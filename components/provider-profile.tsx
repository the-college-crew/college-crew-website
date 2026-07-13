import Link from "next/link";
import { ViewTransition } from "react";

import { openConversationWithProvider } from "@/app/actions/messaging";
import { FormLoader } from "@/components/form-loader";
import { Rating } from "@/components/provider-card";
import { Badge, VerifiedBadge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { getEffectiveRole, getSession } from "@/lib/auth/session";
import type { PublicProviderProfile } from "@/lib/db/queries";
import { formatDate, formatOfferedPrice } from "@/lib/utils";
import { ServiceBanner } from "./service-banner";

const DAY_LABELS: Record<string, string> = {
  mon: "Mon",
  tue: "Tue",
  wed: "Wed",
  thu: "Thu",
  fri: "Fri",
  sat: "Sat",
  sun: "Sun",
};

/** Public provider profile content shown inside the browse overlay. */
export async function ProviderProfile({
  provider,
}: {
  provider: PublicProviderProfile;
}) {
  const days = provider.availability.days ?? [];

  // Pre-booking chat entry point: customers (or visitors, via login) can
  // message the provider directly; providers and admins browsing don't.
  const session = await getSession();
  const viewerRole = session ? await getEffectiveRole() : null;
  const canMessage = !session || viewerRole === "customer";

  return (
    <article className="pennant overflow-hidden rounded-3xl border border-stone bg-paper shadow-xl shadow-viridian/10">
      <ServiceBanner services={provider.services} className="h-52 border-b border-line" />
      {/* Identity — morph target for the Browse card's ViewTransition. */}
      <ViewTransition name={`provider-${provider.id}`} share="morph">
        <section className="px-6 pb-7 pt-14 sm:px-8">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-3xl font-semibold">
              {provider.display_name || "Student provider"}
            </h1>
            <VerifiedBadge />
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
            <p className="mt-4 whitespace-pre-line text-sm leading-relaxed text-ink-soft">
              {provider.bio}
            </p>
          ) : null}
          <div className="mt-5">
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href={`/book/${provider.id}`}
                className={buttonClasses({ size: "lg" })}
              >
                Request booking
              </Link>
              {canMessage ? (
                session ? (
                  <form action={openConversationWithProvider}>
                    <FormLoader />
                    <input
                      type="hidden"
                      name="providerId"
                      value={provider.id}
                    />
                    <button
                      type="submit"
                      className={buttonClasses({
                        variant: "secondary",
                        size: "lg",
                      })}
                    >
                      Message
                    </button>
                  </form>
                ) : (
                  <Link
                    href={`/login?next=${encodeURIComponent(`/providers/${provider.id}`)}`}
                    className={buttonClasses({ variant: "secondary", size: "lg" })}
                  >
                    Message
                  </Link>
                )
              ) : null}
            </div>
            <p className="mt-2 text-xs text-mist">
              No charge until they accept — you confirm and pay afterward.
            </p>
          </div>
        </section>
      </ViewTransition>

      <section className="border-t border-line px-6 py-7 sm:px-8">
        <h2 className="font-display text-2xl font-semibold">
          Services & pricing
        </h2>
        <ul className="mt-4 divide-y divide-line">
          {provider.services.map((offered) => (
            <li
              key={offered.id}
              className="flex items-center justify-between gap-4 py-3 text-sm"
            >
              <span className="font-medium text-ink">{offered.service.name}</span>
              <span className="shrink-0 font-semibold text-quad-700">
                {formatOfferedPrice(offered)}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="border-t border-line px-6 py-7 sm:px-8">
        <h2 className="font-display text-2xl font-semibold">Availability</h2>
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
      </section>

      <section className="border-t border-line px-6 py-7 sm:px-8">
        <h2 className="font-display text-2xl font-semibold">Reviews</h2>
        {provider.reviews.length === 0 ? (
          <p className="mt-3 text-sm text-mist">
            No reviews yet — be their first booking.
          </p>
        ) : (
          <ul className="mt-4 space-y-4">
            {provider.reviews.map((review) => (
              <li
                key={review.id}
                className="border-b border-line pb-4 last:border-0"
              >
                <div className="flex items-center gap-2 text-sm">
                  <span
                    aria-label={`${review.rating} out of 5 stars`}
                    className="text-gold-700"
                  >
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
      </section>
    </article>
  );
}
