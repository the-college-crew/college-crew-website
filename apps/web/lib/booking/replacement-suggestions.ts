import { requestOperationMessage } from "@/lib/booking/requests";
import { getApprovedProviders } from "@/lib/db/queries";
import type { createClient } from "@/lib/supabase/server";

import type {
  ReplacementSuggestion,
  SuggestionTiers,
} from "./replacement-ranking";

type ServerClient = Awaited<ReturnType<typeof createClient>>;

/**
 * Fetches replacement suggestions for a job that lost its student (declined,
 * timed out, or cancelled by the provider).
 *
 * Three tiers, because "nobody is free at your exact time" should not be a dead
 * end when the customer still wants the job done:
 *
 *   Tier 1 — can do the original slot. No trade-off to explain.
 *   Tier 2 — cannot, but has a nearby opening. Surfaced with the time change
 *            made explicit, never silently rescheduled.
 *   Tier 3 — offers the service, with no slot promise at all. Only used to top
 *            the shortlist up to three, and rendered as a person to look at
 *            rather than a slot to hold.
 *
 * Ratings and hourly rates are joined in from the public directory rather than
 * returned by the RPCs, so the browser only ever sees data already cleared for
 * public display (the RPCs hand back IDs, never ZIP or availability facts).
 *
 * The rules that turn this pool into a shortlist live in
 * `replacement-ranking.ts`.
 */
export type ReplacementPool = SuggestionTiers & {
  /**
   * Set when the database refused the lookup (for example a request still
   * inside its response window). Callers that render a whole dashboard ignore
   * it and show no suggestions; the dedicated replacement page reports it.
   */
  error?: string;
};

/**
 * Fetch both tiers for a booking. Never throws: the dashboard renders many
 * cards, and one ineligible booking must not take the page down.
 */
export async function getReplacementPool(
  supabase: ServerClient,
  booking: { id: string; serviceSlug: string },
): Promise<ReplacementPool> {
  const [exactResult, shiftResult, fallbackResult] = await Promise.all([
    supabase.rpc("hourly_replacement_candidate_ids", {
      p_booking_id: booking.id,
    }),
    supabase.rpc("hourly_replacement_time_shift_ids", {
      p_booking_id: booking.id,
    }),
    supabase.rpc("hourly_replacement_fallback_ids", {
      p_booking_id: booking.id,
    }),
  ]);

  const error = exactResult.error ?? shiftResult.error ?? fallbackResult.error;
  const exactRows = exactResult.data ?? [];
  const shiftRows = shiftResult.data ?? [];
  const fallbackRows = fallbackResult.data ?? [];
  if (
    exactRows.length === 0 &&
    shiftRows.length === 0 &&
    fallbackRows.length === 0
  ) {
    return {
      exact: [],
      timeShift: [],
      fallback: [],
      error: error ? requestOperationMessage(error) : undefined,
    };
  }

  const providers = await getApprovedProviders({
    serviceSlug: booking.serviceSlug,
  });
  const providersById = new Map(
    providers.map((provider) => [provider.id, provider]),
  );

  const hydrate = (
    row: { provider_service_id: string; provider_id: string },
    extra: Pick<ReplacementSuggestion, "kind" | "suggestedStartAt"> & {
      payoutReady?: boolean;
    },
  ): ReplacementSuggestion[] => {
    const provider = providersById.get(row.provider_id);
    const offering = provider?.services.find(
      (item) => item.id === row.provider_service_id,
    );
    if (!provider || offering?.hourly_rate_cents == null) return [];
    return [
      {
        providerServiceId: offering.id,
        providerId: provider.id,
        providerName: provider.display_name,
        hourlyRateCents: offering.hourly_rate_cents,
        rating: provider.rating,
        ...extra,
      },
    ];
  };

  return {
    exact: exactRows.flatMap((row) =>
      hydrate(row, { kind: "exact", suggestedStartAt: null }),
    ),
    timeShift: shiftRows.flatMap((row) =>
      hydrate(row, {
        kind: "time_shift",
        suggestedStartAt: row.suggested_start_at,
      }),
    ),
    fallback: fallbackRows.flatMap((row) =>
      hydrate(row, {
        kind: "browse",
        suggestedStartAt: null,
        payoutReady: row.payout_ready,
      }),
    ),
  };
}
