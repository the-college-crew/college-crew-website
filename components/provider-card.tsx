import Link from "next/link";

import { Badge, BackgroundCheckBadge, VerifiedBadge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
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

/** Roster-style card used on Browse; all data comes from approved providers. */
export function ProviderCard({ provider }: { provider: ProviderCardData }) {
  return (
    <Card pennant className="flex flex-col gap-3 p-5">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-display text-xl font-semibold">
          {provider.display_name || "Student provider"}
        </h3>
        <VerifiedBadge />
        {provider.background_check_status === "passed" ? (
          <BackgroundCheckBadge />
        ) : null}
      </div>

      <div className="flex items-center gap-3">
        <Badge tone={provider.provider_type === "business" ? "blue" : "gray"}>
          {provider.provider_type === "business"
            ? "Student business"
            : "Individual student"}
        </Badge>
        <Rating rating={provider.rating} />
      </div>

      {provider.bio ? (
        <p className="line-clamp-2 text-sm text-ink-soft">{provider.bio}</p>
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
          </li>
        ))}
      </ul>

      <div className="mt-auto pt-2">
        <Link
          href={`/providers/${provider.id}`}
          className={buttonClasses({ variant: "secondary", size: "sm" })}
        >
          View profile
        </Link>
      </div>
    </Card>
  );
}
