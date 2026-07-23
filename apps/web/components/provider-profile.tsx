import Link from "next/link";
import { ViewTransition } from "react";

import { openConversationWithProvider } from "@/app/actions/messaging";
import { FormLoader } from "@/components/form-loader";
import { LocationLine, Rating } from "@/components/provider-card";
import { SchoolIdentity } from "@/components/school-identity";
import { Badge, VerifiedBadge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import {
  getEffectiveRole,
  getOwnProviderProfile,
  getSession,
} from "@/lib/auth/session";
import type { PublicProviderProfile } from "@/lib/db/queries";
import { providerAvatarUrl } from "@/lib/media/provider-avatars";
import {
  PROVIDER_WEEKDAYS,
  formatAvailabilityWindow,
  groupAvailabilityWindows,
} from "@/lib/provider/setup";
import { formatDate, formatOfferedPrice } from "@/lib/utils";
import {
  areBookingRequestsEnabled,
  isHourlyBookingEnabled,
} from "@/lib/env";
import { ProfileBanner } from "./profile-banner";

/** Public provider profile content shown inside the browse overlay. */
export async function ProviderProfile({
  provider,
}: {
  provider: PublicProviderProfile;
}) {
  const availabilityGroups = groupAvailabilityWindows(
    provider.availability_windows,
  );
  const hasHourlyOffering = provider.services.some(
    (offering) => offering.is_hourly_bookable,
  );
  const hasQuoteOffering = provider.services.some(
    (offering) => offering.is_quote_bookable,
  );
  const hasBookableOffering = hasHourlyOffering || hasQuoteOffering;
  const canRequest =
    areBookingRequestsEnabled() &&
    (hasQuoteOffering || (hasHourlyOffering && isHourlyBookingEnabled()));

  // Pre-booking chat entry point. Any regular account can message a provider
  // (providers included — providing is a capability, not a wall); admins only
  // while previewing as a customer. Nobody messages or books their own listing.
  const session = await getSession();
  const viewerRole = session ? await getEffectiveRole() : null;
  const ownProviderProfile = session ? await getOwnProviderProfile() : null;
  const isOwnListing = ownProviderProfile?.id === provider.id;
  const canMessage =
    !isOwnListing &&
    (!session ||
      session.profile.role !== "admin" ||
      viewerRole === "customer");
  const avatarUrl = providerAvatarUrl(provider.avatar_image_path);

  return (
    <article className="pennant overflow-hidden rounded-3xl border border-stone bg-paper shadow-xl shadow-viridian/10">
      <ProfileBanner
        imagePath={provider.banner_image_path}
        style={provider.banner_style}
        focalX={provider.banner_focal_x}
        focalY={provider.banner_focal_y}
        className="h-52 border-b border-line"
      />
      {/* Identity — morph target for the Browse card's ViewTransition. */}
      <ViewTransition name={`provider-${provider.id}`} share="morph">
        <section className="px-6 pb-7 pt-14 sm:px-8">
          {/* Headshot lifted to overlap the banner above. Public asset, so a
              plain <img> avoids stale optimizer copies after replace. */}
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatarUrl}
              alt=""
              className="-mt-[4.5rem] relative z-10 mb-3 h-24 w-24 rounded-full border-4 border-paper object-cover shadow-md"
              style={{
                objectPosition: `${provider.avatar_focal_x}% ${provider.avatar_focal_y}%`,
              }}
            />
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-3xl font-semibold">
              {provider.company_name || provider.display_name || "Student provider"}
            </h1>
            <VerifiedBadge />
            <Rating rating={provider.rating} />
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <Badge tone={provider.provider_type === "business" ? "blue" : "gray"}>
              {provider.provider_type === "business"
                ? "Student business"
                : "Hardworking individual"}
            </Badge>
            <LocationLine
              town={provider.town}
              distanceMiles={provider.distance_miles}
              className="text-xs text-mist"
            />
          </div>
          <SchoolIdentity
            name={provider.school_name}
            domain={provider.school_domain}
            greekOrganization={provider.greek_organization}
            className="mt-4"
          />
          {provider.bio ? (
            <p className="mt-4 whitespace-pre-line text-sm leading-relaxed text-ink-soft">
              {provider.bio}
            </p>
          ) : null}
          <div className="mt-5">
            <div className="flex flex-wrap items-center gap-2">
              {isOwnListing ? (
                <span
                  aria-disabled="true"
                  className={buttonClasses({
                    size: "lg",
                    className: "cursor-not-allowed opacity-55",
                  })}
                >
                  This is your listing
                </span>
              ) : canRequest ? (
                <Link
                  href={`/book/${provider.id}`}
                  className={buttonClasses({ size: "lg" })}
                >
                  Request booking
                </Link>
              ) : (
                <span
                  aria-disabled="true"
                  className={buttonClasses({
                    size: "lg",
                    className: "cursor-not-allowed opacity-55",
                  })}
                >
                  {hasBookableOffering
                    ? "Booking requests open soon"
                    : "Booking setup in progress"}
                </span>
              )}
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
              {canRequest
                ? hasQuoteOffering
                  ? "Flat quotes are finalized after the provider reviews your request."
                  : "One-hour minimum, then billed in 15-minute increments."
                : hasBookableOffering
                  ? "Customer requests remain disabled during setup."
                  : "This provider is still finishing booking setup."}
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
              {!offered.is_bookable ? (
                <span className="text-xs text-mist">Not yet bookable</span>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      <section className="border-t border-line px-6 py-7 sm:px-8">
        <h2 className="font-display text-2xl font-semibold">Availability</h2>
        {availabilityGroups.length === 0 && !provider.availability_note ? (
          <p className="mt-3 text-sm text-mist">
            Ask about availability when you request a booking.
          </p>
        ) : (
          <>
            {availabilityGroups.map((group) => (
              <div
                key={`${group.start}-${group.end}`}
                className="mt-3 flex flex-wrap items-center gap-2"
              >
                <ul className="flex flex-wrap gap-2">
                  {group.weekdays.map((day) => (
                    <li
                      key={day}
                      className="rounded-full border border-quad-200 bg-quad-50 px-3 py-1 text-xs font-semibold text-quad-800"
                    >
                      {PROVIDER_WEEKDAYS.find(({ value }) => value === day)
                        ?.short ?? day}
                    </li>
                  ))}
                </ul>
                <span className="text-sm font-medium text-ink-soft">
                  {formatAvailabilityWindow(group.start, group.end)}
                </span>
              </div>
            ))}
            {provider.availability_note ? (
              <p className="mt-3 text-sm text-ink-soft">
                {provider.availability_note}
              </p>
            ) : null}
            <p className="mt-2 text-xs text-mist">
              Request at least {provider.minimum_notice_hours} hours ahead.
            </p>
          </>
        )}
      </section>

      <section className="border-t border-line px-6 py-7 sm:px-8">
        <h2 className="font-display text-2xl font-semibold">Reviews</h2>
        {provider.reviews.length === 0 ? (
          <p className="mt-3 text-sm text-mist">
            No reviews yet. Be their first booking.
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
