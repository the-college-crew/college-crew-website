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
}) {
  if (offerings.length === 0) {
    return (
      <div className="rounded-lg border border-gold-300 bg-gold-100 p-4 text-sm text-gold-800">
        Add at least one live service and its pricing before customers can book
        you.
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
