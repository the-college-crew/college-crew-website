import {
  ProviderCardLink,
  ProviderCardViewTransition,
} from "@/components/provider-card-link";
import { ServiceBanner } from "@/components/service-banner";
import { Badge, VerifiedCheck } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { ProviderCard as ProviderCardData } from "@/lib/db/queries";
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

/**
 * Roster-style card used on Browse; all data comes from approved providers.
 * The whole card links to the profile (flip + morph via ProviderCardLink);
 * the ViewTransition name pairs with the profile page's identity card.
 */
export function ProviderCard({ provider }: { provider: ProviderCardData }) {
  const href = `/providers/${provider.id}`;

  return (
    <ProviderCardViewTransition href={href} name={`provider-${provider.id}`}>
      <ProviderCardLink href={href}>
        <Card
          pennant
          className="flex flex-col transition-shadow group-hover/flip:shadow-md group-hover/flip:shadow-viridian/10"
        >
          <ServiceBanner services={provider.services} />

          <div className="flex flex-col gap-2.5 p-5">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-display text-xl font-semibold">
                {provider.display_name || "Student provider"}
              </h3>
              <VerifiedCheck />
            </div>

            <div className="flex items-center gap-3">
              <Badge tone={provider.provider_type === "business" ? "blue" : "gray"}>
                {provider.provider_type === "business"
                  ? "Student business"
                  : "Hardworking individual"}
              </Badge>
              <Rating rating={provider.rating} />
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
