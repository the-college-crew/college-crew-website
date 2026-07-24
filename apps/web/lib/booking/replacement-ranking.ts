/**
 * Ranking policy for replacement suggestions.
 *
 * Pure functions only — no database access — so the shortlist rules and the
 * `?at=` validation are unit-testable on their own. The I/O that feeds these
 * lives in `replacement-suggestions.ts`.
 */

export const MAX_SUGGESTIONS = 3;

export type ReplacementSuggestion = {
  providerServiceId: string;
  providerId: string;
  providerName: string;
  hourlyRateCents: number;
  rating: { avg: number; count: number } | null;
  /**
   * Null for a tier-1 match (the original time works). Set for tier 2 — this is
   * the start time the customer would be agreeing to instead.
   */
  suggestedStartAt: string | null;
};

/** The two suggestion tiers. Tier 1 fits the original slot; tier 2 needs a
 *  time change. */
export type SuggestionTiers = {
  exact: ReplacementSuggestion[];
  timeShift: ReplacementSuggestion[];
};

type Pool = SuggestionTiers;

/** Rating on a 0-1 scale. An unrated student sits neutral, not last: being new
 *  is not evidence of being bad, and the pilot is full of new students. */
function ratingScore(suggestion: ReplacementSuggestion): number {
  if (!suggestion.rating || suggestion.rating.count === 0) return 0.5;
  return Math.max(0, Math.min(1, (suggestion.rating.avg - 1) / 4));
}

function hoursFrom(suggestion: ReplacementSuggestion, target: Date): number {
  if (!suggestion.suggestedStartAt) return 0;
  return (
    Math.abs(new Date(suggestion.suggestedStartAt).getTime() - target.getTime()) /
    3_600_000
  );
}

/**
 * Pick the shortlist shown on the card.
 *
 * Tier 1 first — an exact-time match has no downside to weigh. If that leaves
 * room, tier 2 fills it with deliberately *different* kinds of option rather
 * than three variations of "soonest": the closest time, then the best-rated,
 * then the best all-round compromise. With one slot left the compromise pick is
 * what you want; with three you want the spread, because a customer choosing
 * between alternatives is trading time against who shows up.
 *
 * Never returns the same provider twice, even across tiers.
 */
export function pickSuggestions(
  pool: Pool,
  originalStartAt: string,
  limit = MAX_SUGGESTIONS,
): ReplacementSuggestion[] {
  const target = new Date(originalStartAt);
  const picked: ReplacementSuggestion[] = [];
  const seenProviders = new Set<string>();

  const take = (suggestion: ReplacementSuggestion) => {
    if (seenProviders.has(suggestion.providerId)) return;
    seenProviders.add(suggestion.providerId);
    picked.push(suggestion);
  };

  for (const suggestion of pool.exact) {
    if (picked.length >= limit) break;
    take(suggestion);
  }
  if (picked.length >= limit) return picked;

  const remaining = () =>
    pool.timeShift.filter(
      (candidate) => !seenProviders.has(candidate.providerId),
    );

  const maxHours = Math.max(
    1,
    ...pool.timeShift.map((candidate) => hoursFrom(candidate, target)),
  );
  const balancedScore = (candidate: ReplacementSuggestion) =>
    0.5 * ratingScore(candidate) +
    0.5 * (1 - hoursFrom(candidate, target) / maxHours);

  // Order matters: with only one slot free we want the compromise, not an
  // extreme. Wider shortlists then add the two ends of the trade-off.
  const strategies: ((candidates: ReplacementSuggestion[]) => ReplacementSuggestion)[] =
    picked.length === limit - 1
      ? [(c) => best(c, balancedScore)]
      : [
          (c) => best(c, (x) => -hoursFrom(x, target)),
          (c) => best(c, ratingScore),
          (c) => best(c, balancedScore),
        ];

  for (const strategy of strategies) {
    if (picked.length >= limit) break;
    const candidates = remaining();
    if (candidates.length === 0) break;
    take(strategy(candidates));
  }

  // Any leftover room goes to the closest remaining times.
  for (const candidate of remaining()) {
    if (picked.length >= limit) break;
    take(candidate);
  }

  return picked;
}

/** Highest score wins; ties keep the RPC's own ordering (already sensible). */
function best(
  candidates: ReplacementSuggestion[],
  score: (candidate: ReplacementSuggestion) => number,
): ReplacementSuggestion {
  let winner = candidates[0];
  let winningScore = score(winner);
  for (const candidate of candidates.slice(1)) {
    const candidateScore = score(candidate);
    if (candidateScore > winningScore) {
      winner = candidate;
      winningScore = candidateScore;
    }
  }
  return winner;
}

/**
 * Server-side check that a chosen start time is one we actually offered. The
 * `at` value arrives in a URL, so it is re-derived from the RPC and never
 * trusted — a customer must not be able to book an arbitrary time past a
 * provider's availability or notice window by editing a query string.
 */
export function isOfferedStartTime(
  pool: Pool,
  providerServiceId: string,
  startAt: string,
): boolean {
  const wanted = new Date(startAt).getTime();
  return pool.timeShift.some(
    (candidate) =>
      candidate.providerServiceId === providerServiceId &&
      candidate.suggestedStartAt != null &&
      new Date(candidate.suggestedStartAt).getTime() === wanted,
  );
}
