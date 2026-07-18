/**
 * Provider recommendation ranking for the default ("suggested") Browse sort.
 *
 * The score is quality-driven with deliberate exploration noise, then demoted
 * by distance:
 *
 *   score = (QUALITY_WEIGHT · quality + RANDOM_WEIGHT · dailyRandom) · distance
 *
 * `quality` is the equal-weighted mean of three sub-scores, each normalized to
 * 0..1 (smoothed rating, log-scaled completed jobs, profile completeness).
 * `dailyRandom` is a deterministic per-provider value that rotates once a day —
 * it spreads exposure across providers without reshuffling the list on every
 * page load. `distance` is a post-ranking multiplier that gradually demotes
 * farther providers without hiding them.
 *
 * Everything here is pure and side-effect-free so it stays unit-testable; the
 * data fetching and sort wiring live in lib/db/queries.ts.
 */

// --- Tunable weights -------------------------------------------------------

/** Split between earned quality and exploration noise. Must sum to 1. */
export const QUALITY_WEIGHT = 0.8;
export const RANDOM_WEIGHT = 0.2;

/** Equal thirds inside the quality bucket. Kept explicit so they're easy to tune. */
export const RATING_SUBWEIGHT = 1 / 3;
export const JOBS_SUBWEIGHT = 1 / 3;
export const COMPLETENESS_SUBWEIGHT = 1 / 3;

/**
 * Bayesian prior for the rating: every provider starts as if they already had
 * RATING_PRIOR_COUNT reviews averaging RATING_PRIOR_MEAN stars. This stops a
 * lone 5-star review from outranking a long, slightly-lower track record, and
 * softens the blow of a provider's first mediocre review.
 */
export const RATING_PRIOR_MEAN = 4.0;
export const RATING_PRIOR_COUNT = 3;

/** Completed-job count at which the jobs sub-score saturates to ~1. */
export const JOBS_SATURATION = 25;

/** Completeness signals and their weights (must sum to 1). */
export const BIO_WEIGHT = 0.5;
export const PREVIEW_WEIGHT = 0.5;

// --- Sub-scores (each returns 0..1) ---------------------------------------

/**
 * Smoothed rating on a 0..1 scale. `avg`/`count` come from the provider_ratings
 * view; a provider with no reviews scores at the prior mean, not zero.
 */
export function smoothedRatingScore(avg: number, count: number): number {
  const safeCount = Math.max(0, count);
  const smoothed =
    (avg * safeCount + RATING_PRIOR_MEAN * RATING_PRIOR_COUNT) /
    (safeCount + RATING_PRIOR_COUNT);
  // Map the 1..5 star range onto 0..1, clamped for safety.
  return clamp01((smoothed - 1) / 4);
}

/**
 * Log-scaled completed-job score. Grows fast for the first handful of jobs then
 * flattens, so a busy provider can't drown out rating and completeness entirely.
 */
export function jobsScore(completedJobs: number): number {
  const jobs = Math.max(0, completedJobs);
  return clamp01(Math.log1p(jobs) / Math.log1p(JOBS_SATURATION));
}

/** Profile completeness from the signals shown on a Browse card. */
export function completenessScore(input: {
  hasBio: boolean;
  hasPreview: boolean;
}): number {
  return (
    (input.hasBio ? BIO_WEIGHT : 0) + (input.hasPreview ? PREVIEW_WEIGHT : 0)
  );
}

/**
 * Deterministic 0..1 value for a provider on a given day. Same input → same
 * output, so the list is stable within a day; the dateKey rotates it daily.
 * dateKey is any per-day string (e.g. a UTC "YYYY-MM-DD").
 */
export function dailySeed(providerId: string, dateKey: string): number {
  return hashToUnitInterval(`${providerId}:${dateKey}`);
}

/**
 * Distance demotion multiplier by measured straight-line miles:
 *   ≤3 → 1.0, ≤5 → 0.8, ≤8 → 0.6, >8 → 0.5.
 * A null distance (viewer origin unknown, or provider not geocoded) is
 * unmeasurable and stays neutral at 1.0 — we never hide a provider we can't
 * actually place.
 */
export function distanceMultiplier(miles: number | null): number {
  if (miles == null) return 1;
  if (miles <= 3) return 1;
  if (miles <= 5) return 0.8;
  if (miles <= 8) return 0.6;
  return 0.5;
}

/**
 * Ascending distance comparator for the explicit Location sort. Providers
 * without a measurable distance come after every provider we can place.
 */
export function compareDistanceNearestFirst(
  aMiles: number | null,
  bMiles: number | null,
): number {
  const a = aMiles != null && Number.isFinite(aMiles) ? aMiles : null;
  const b = bMiles != null && Number.isFinite(bMiles) ? bMiles : null;
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a - b;
}

// --- Composite score -------------------------------------------------------

export type RankingInput = {
  providerId: string;
  avgRating: number;
  reviewCount: number;
  completedJobs: number;
  hasBio: boolean;
  hasPreview: boolean;
  distanceMiles: number | null;
  dateKey: string;
};

/**
 * Final recommendation score (higher ranks first). Distance can demote a
 * provider, but it never makes an otherwise eligible provider disappear.
 */
export function recommendationScore(input: RankingInput): number {
  const quality =
    RATING_SUBWEIGHT * smoothedRatingScore(input.avgRating, input.reviewCount) +
    JOBS_SUBWEIGHT * jobsScore(input.completedJobs) +
    COMPLETENESS_SUBWEIGHT *
      completenessScore({
        hasBio: input.hasBio,
        hasPreview: input.hasPreview,
      });
  const base =
    QUALITY_WEIGHT * quality +
    RANDOM_WEIGHT * dailySeed(input.providerId, input.dateKey);
  return base * distanceMultiplier(input.distanceMiles);
}

/** UTC "YYYY-MM-DD" — the default daily rotation key. */
export function utcDateKey(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

// --- helpers ---------------------------------------------------------------

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/**
 * cyrb53 string hash mapped to [0, 1). Good avalanche/distribution for short
 * keys and fully deterministic across runs (no Math.random, no per-request drift).
 */
function hashToUnitInterval(key: string): number {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < key.length; i++) {
    const ch = key.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  // 53-bit unsigned integer → [0, 1).
  const value = 4294967296 * (2097151 & h2) + (h1 >>> 0);
  return value / 9007199254740992;
}
