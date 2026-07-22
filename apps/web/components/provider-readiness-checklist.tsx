import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import type { ProviderProfile } from "@/lib/db/types";
import {
  getOfferingReadiness,
  type AvailabilityWindow,
} from "@/lib/provider/setup";
import { formatOfferedPrice } from "@/lib/utils";

export type ReadinessOffering = {
  id: string;
  name: string;
  hourly_rate_cents: number | null;
  pricing_mode: "hourly" | "quote";
  average_quote_cents: number | null;
  service_slug: string;
  service_is_live: boolean;
};

export function ProviderReadinessChecklist({
  profile,
  offerings,
  windows,
  legalAcceptance,
  acceptHref,
  offeringsHref,
}: {
  profile: Pick<
    ProviderProfile,
    | "verification_status"
    | "stripe_account_id"
    | "stripe_transfers_active"
    | "stripe_transfers_checked_at"
    | "service_zip"
  >;
  offerings: ReadinessOffering[];
  windows: AvailabilityWindow[];
  legalAcceptance?: { ready: boolean; version: string };
  /**
   * Where an unsigned provider goes to accept the addendum. Omitted on the
   * admin review modal, where the founder is looking at someone else's status
   * and has nothing to sign.
   */
  acceptHref?: string;
  /**
   * Where a provider goes to add services/pricing. Omitted on the admin
   * review modal, where the founder can't edit someone else's business
   * profile from this view.
   */
  offeringsHref?: string;
}) {
  if (offerings.length === 0) {
    return (
      <div className="flex flex-col gap-3 rounded-lg border border-gold-300 bg-gold-100 p-4 text-sm text-gold-800 sm:flex-row sm:items-center sm:justify-between">
        <p>
          Add at least one live service and its pricing before customers can
          book you.
        </p>
        {offeringsHref ? (
          <Link
            href={offeringsHref}
            className="inline-flex shrink-0 items-center self-start rounded-md border border-gold-400 bg-gold-200 px-3 py-1.5 text-sm font-medium text-gold-900 hover:bg-gold-300 sm:self-auto"
          >
            Add a service
          </Link>
        ) : null}
      </div>
    );
  }

  const rows = offerings.map((offering) => ({
    offering,
    readiness: getOfferingReadiness(profile, offering, windows),
  }));
  const allReady =
    rows.every(({ readiness }) => readiness.bookable) &&
    (legalAcceptance?.ready ?? true);

  return (
    <div className="rounded-lg border border-line bg-court/60 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-display text-base font-semibold">
          Booking readiness
        </h3>
        <Badge tone={allReady ? "green" : "gold"}>
          {allReady ? "Ready" : "Setup needed"}
        </Badge>
      </div>
      {legalAcceptance ? (
        <p
          className={`mt-3 text-xs font-medium ${
            legalAcceptance.ready ? "text-quad-700" : "text-gold-700"
          }`}
        >
          {legalAcceptance.ready ? "✓" : "○"} Provider agreement version{" "}
          {legalAcceptance.version}{legalAcceptance.ready ? " accepted" : " required"}
          {!legalAcceptance.ready && acceptHref ? (
            <>
              {" · "}
              <Link href={acceptHref} className="underline underline-offset-2">
                Review &amp; accept it
              </Link>
            </>
          ) : null}
        </p>
      ) : null}
      <ul className="mt-3 space-y-3">
        {rows.map(({ offering, readiness }) => (
          <li key={offering.id} className="rounded-lg border border-line bg-paper p-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="font-semibold">{offering.name}</span>
              <span className="font-medium text-quad-700">
                {formatOfferedPrice(offering)}
              </span>
            </div>
            {readiness.bookable ? (
              <p className="mt-1 text-xs font-medium text-quad-700">
                Ready for {offering.pricing_mode === "quote" ? "quote" : "hourly"} requests
              </p>
            ) : (
              <ul className="mt-2 grid gap-1 text-xs text-ink-soft sm:grid-cols-2">
                {readiness.requirements.map((requirement) => (
                  <li key={requirement.key}>
                    <span
                      aria-hidden
                      className={requirement.ready ? "text-quad-700" : "text-gold-700"}
                    >
                      {requirement.ready ? "✓" : "○"}
                    </span>{" "}
                    {requirement.label}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
