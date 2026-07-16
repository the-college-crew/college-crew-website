import {
  ProviderCardLink,
  ProviderCardViewTransition,
} from "@/components/provider-card-link";
import { ProfileBanner } from "@/components/profile-banner";
import { Badge, VerifiedCheck } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { ProviderCard as ProviderCardData } from "@/lib/db/queries";
import { formatMiles } from "@/lib/geo/distance";
import { providerAvatarUrl } from "@/lib/media/provider-avatars";
import { formatOfferedPrice } from "@/lib/utils";

export function Rating({
  rating,
}: {
  rating: { avg: number; count: number } | null;
}) {
  if (!rating) {
    return <span className="text-xs font-medium text-mist">New to the crew</span>;
  }
  return (
    <span className="text-xs font-medium text-ink-soft">
      <span aria-hidden className="text-gold-700">
        ★
      </span>{" "}
      {rating.avg.toFixed(1)}{" "}
      <span className="text-mist">
        ({rating.count} review{rating.count === 1 ? "" : "s"})
      </span>
    </span>
  );
}

/** "Town · 2.3 mi away" — town only when either side lacks coordinates. */
export function LocationLine({
  town,
  distanceMiles,
  className,
}: {
  town: string;
  distanceMiles: number | null;
  className?: string;
}) {
  if (!town && distanceMiles == null) return null;
  return (
    <span className={className ?? "text-xs font-medium text-ink-soft"}>
      {town}
      {town && distanceMiles != null ? " · " : ""}
      {distanceMiles != null ? (
        <span className="text-mist">{formatMiles(distanceMiles)} away</span>
      ) : null}
    </span>
  );
}

/**
 * Roster-style card used on Browse; all data comes from approved providers.
 * The whole card links to the profile (flip + morph via ProviderCardLink);
 * the ViewTransition name pairs with the profile page's identity card.
 */
export function ProviderCard({ provider }: { provider: ProviderCardData }) {
  const href = `/providers/${provider.id}`;
  const avatarUrl = providerAvatarUrl(provider.avatar_image_path);

  return (
    <ProviderCardViewTransition href={href} name={`provider-${provider.id}`}>
      <ProviderCardLink href={href}>
        <Card
          pennant
          className="flex flex-col transition-shadow group-hover/flip:shadow-md group-hover/flip:shadow-viridian/10"
        >
          {/* Taller than the profile page's strip so Browse gets a real visual
              beat per card; the slow zoom rides the same group/flip hover as
              the card lift (clipped by the Card's overflow-hidden). */}
          <ProfileBanner
            imagePath={provider.banner_image_path}
            style={provider.banner_style}
            className="h-32 transition-transform duration-500 ease-out group-hover/flip:scale-[1.04]"
          />

          <div className="flex flex-col gap-2.5 p-5">
            {/* Round headshot lifted to overlap the banner above. Public asset,
                so a plain <img> avoids stale optimizer copies after replace. */}
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatarUrl}
                alt=""
                className="-mt-12 relative z-10 h-16 w-16 rounded-full border-4 border-paper object-cover shadow-sm"
              />
            ) : null}
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-display text-xl font-semibold">
                {provider.company_name || provider.display_name || "Student provider"}
              </h3>
              <VerifiedCheck />
              <Rating rating={provider.rating} />
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Badge tone={provider.provider_type === "business" ? "blue" : "gray"}>
                {provider.provider_type === "business"
                  ? "Student business"
                  : "Hardworking individual"}
              </Badge>
              <LocationLine
                town={provider.town}
                distanceMiles={provider.distance_miles}
              />
            </div>

            {provider.bio ? (
              (() => {
                const paragraphs = provider.bio.split(/\n\s*\n/);
                const firstParagraph = paragraphs[0];
                const hasMore = paragraphs.length > 1;
                return (
                  <p className="whitespace-pre-line text-sm text-ink-soft">
                    {hasMore ? `${firstParagraph}…` : firstParagraph}
                  </p>
                );
              })()
            ) : null}

            {provider.quote ? (
              <p className="line-clamp-2 border-l-2 border-gold-400 pl-3 text-sm italic text-ink-soft">
                &ldquo;{provider.quote}&rdquo;
              </p>
            ) : null}

            <ul className="flex flex-wrap gap-2">
              {provider.services.map((offered) => (
                <li
                  key={offered.id}
                  className="rounded-full border border-line bg-court px-3 py-1 text-xs font-medium text-ink-soft"
                >
                  {offered.service.name}
                  <span className="ml-1.5 font-semibold text-quad-700">
                    {formatOfferedPrice(offered)}
                  </span>
                  {!offered.is_hourly_bookable ? (
                    <span className="ml-1 text-mist">· setup pending</span>
                  ) : null}
                </li>
              ))}
            </ul>
            <p className="text-[11px] text-mist">
              One-hour minimum, then billed in 15-minute increments.
            </p>
          </div>
        </Card>
      </ProviderCardLink>
    </ProviderCardViewTransition>
  );
}
