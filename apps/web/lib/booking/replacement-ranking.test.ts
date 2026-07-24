import { describe, expect, it } from "vitest";

import {
  isOfferedStartTime,
  pickSuggestions,
  type ReplacementSuggestion,
  type SuggestionTiers,
} from "./replacement-ranking";

const ORIGINAL = "2026-07-26T20:00:00Z";

/** Tier-1 candidate: can do the original time. */
function suggestion(
  overrides: Partial<ReplacementSuggestion> & { providerId: string },
): ReplacementSuggestion {
  return {
    providerServiceId: `ps-${overrides.providerId}`,
    providerName: `Student ${overrides.providerId}`,
    hourlyRateCents: 3000,
    rating: null,
    kind: "exact",
    suggestedStartAt: null,
    ...overrides,
  };
}

/** Tier-2 candidate: `hoursOff` from the original time, with a rating. */
function shifted(
  providerId: string,
  hoursOff: number,
  avg: number | null,
): ReplacementSuggestion {
  return suggestion({
    providerId,
    kind: "time_shift",
    rating: avg == null ? null : { avg, count: 5 },
    suggestedStartAt: new Date(
      new Date(ORIGINAL).getTime() + hoursOff * 3_600_000,
    ).toISOString(),
  });
}

/** Tier-3 candidate: offers the service, no slot promise. */
function browse(providerId: string, payoutReady = true): ReplacementSuggestion {
  return suggestion({ providerId, kind: "browse", payoutReady });
}

/** Builds a pool, defaulting the tiers you don't care about to empty. */
function pool(tiers: Partial<SuggestionTiers>): SuggestionTiers {
  return { exact: [], timeShift: [], fallback: [], ...tiers };
}

describe("pickSuggestions", () => {
  it("returns nothing when there is nobody to suggest", () => {
    expect(pickSuggestions(pool({}), ORIGINAL)).toEqual([]);
  });

  it("offers only exact-time matches for a fixed-time job", () => {
    // A "this time only" booking gets an empty timeShift tier from the RPC, so
    // the shortlist must never fall back to moving the job.
    const picked = pickSuggestions(
      pool({
        exact: [suggestion({ providerId: "a" }), suggestion({ providerId: "b" })],
      }),
      ORIGINAL,
    );

    expect(picked).toHaveLength(2);
    expect(picked.every((row) => row.suggestedStartAt === null)).toBe(true);
  });

  it("caps the shortlist at three", () => {
    const picked = pickSuggestions(
      pool({
        exact: ["a", "b", "c", "d"].map((id) => suggestion({ providerId: id })),
      }),
      ORIGINAL,
    );

    expect(picked).toHaveLength(3);
  });

  it("prefers exact-time matches over any time change", () => {
    const picked = pickSuggestions(
      pool({
        exact: [suggestion({ providerId: "exact" })],
        timeShift: [shifted("shift", 0.5, 5)],
      }),
      ORIGINAL,
    );

    expect(picked[0].providerId).toBe("exact");
    expect(picked[0].suggestedStartAt).toBeNull();
  });

  it("spreads a full tier-2 shortlist across closest, best-rated, and balanced", () => {
    // The point of the spread: a customer picking an alternative is trading
    // time against who turns up, so give them both ends plus a compromise.
    const closestButPoor = shifted("closest", 0.5, 1.5);
    const bestRatedButFar = shifted("best-rated", 40, 5);
    const balanced = shifted("balanced", 6, 4.4);
    const alsoRan = shifted("also-ran", 30, 2);

    const picked = pickSuggestions(
      pool({
        timeShift: [closestButPoor, bestRatedButFar, balanced, alsoRan],
      }),
      ORIGINAL,
    );

    expect(picked.map((row) => row.providerId)).toEqual([
      "closest",
      "best-rated",
      "balanced",
    ]);
  });

  it("uses the last free slot on the balanced pick, not an extreme", () => {
    // Two exact matches already fill the card; the single remaining slot should
    // be a sane all-rounder rather than a 5-star student two days away.
    const picked = pickSuggestions(
      pool({
        exact: [suggestion({ providerId: "a" }), suggestion({ providerId: "b" })],
        timeShift: [
          shifted("far-but-perfect", 48, 5),
          shifted("near-and-good", 1, 4.2),
        ],
      }),
      ORIGINAL,
    );

    expect(picked).toHaveLength(3);
    expect(picked[2].providerId).toBe("near-and-good");
  });

  it("treats an unrated student as neutral, not worst", () => {
    // Most pilot students have no reviews yet; ranking them last would bury
    // every new student behind anyone with a single mediocre rating.
    const picked = pickSuggestions(
      pool({
        exact: [suggestion({ providerId: "x" }), suggestion({ providerId: "y" })],
        timeShift: [shifted("new", 1, null), shifted("poorly-rated", 1.5, 1)],
      }),
      ORIGINAL,
    );

    expect(picked[2].providerId).toBe("new");
  });

  it("never suggests the same provider twice across tiers", () => {
    const picked = pickSuggestions(
      pool({
        exact: [suggestion({ providerId: "dup" })],
        timeShift: [shifted("dup", 2, 5), shifted("other", 3, 4)],
        fallback: [browse("dup"), browse("third")],
      }),
      ORIGINAL,
    );

    expect(picked.filter((row) => row.providerId === "dup")).toHaveLength(1);
    expect(picked.map((row) => row.providerId)).toEqual([
      "dup",
      "other",
      "third",
    ]);
  });
});

describe("pickSuggestions — tier-3 fallback", () => {
  it("tops a short list up to three with anyone else who does the service", () => {
    // The whole point: a customer whose student fell through should never face
    // an empty list while other students offer the same service.
    const picked = pickSuggestions(
      pool({
        exact: [suggestion({ providerId: "only-match" })],
        fallback: [browse("a"), browse("b"), browse("c")],
      }),
      ORIGINAL,
    );

    expect(picked.map((row) => row.providerId)).toEqual([
      "only-match",
      "a",
      "b",
    ]);
  });

  it("fills the whole list from the fallback when no slot works at all", () => {
    const picked = pickSuggestions(
      pool({ fallback: [browse("a"), browse("b"), browse("c"), browse("d")] }),
      ORIGINAL,
    );

    expect(picked).toHaveLength(3);
    expect(picked.every((row) => row.kind === "browse")).toBe(true);
  });

  it("keeps the database's fallback order", () => {
    // The RPC already ranks these payout-ready first, then local, then rated —
    // so the app must not reshuffle them.
    const picked = pickSuggestions(
      pool({ fallback: [browse("ready", true), browse("unfinished", false)] }),
      ORIGINAL,
    );

    expect(picked.map((row) => row.providerId)).toEqual([
      "ready",
      "unfinished",
    ]);
  });

  it("never displaces a bookable option with a fallback", () => {
    const picked = pickSuggestions(
      pool({
        exact: [suggestion({ providerId: "a" })],
        timeShift: [shifted("b", 2, 4)],
        fallback: [browse("c")],
      }),
      ORIGINAL,
    );

    expect(picked.map((row) => row.kind)).toEqual([
      "exact",
      "time_shift",
      "browse",
    ]);
  });

  it("still returns fewer than three when the service has nobody left", () => {
    // We top up from the same service only — never by suggesting a different
    // one — so running out is a legitimate short list.
    const picked = pickSuggestions(
      pool({ exact: [suggestion({ providerId: "a" })], fallback: [browse("b")] }),
      ORIGINAL,
    );

    expect(picked).toHaveLength(2);
  });
});

describe("isOfferedStartTime", () => {
  const tiers = pool({
    exact: [suggestion({ providerId: "exact" })],
    timeShift: [shifted("shift", 2, 4)],
    fallback: [browse("browse")],
  });
  const offered = tiers.timeShift[0].suggestedStartAt!;

  it("accepts a time the database actually offered", () => {
    expect(isOfferedStartTime(tiers, "ps-shift", offered)).toBe(true);
  });

  it("rejects a time nobody offered", () => {
    // Guards the ?at= query parameter: editing it must not book a slot outside
    // the provider's availability or notice window.
    expect(isOfferedStartTime(tiers, "ps-shift", "2026-07-26T04:00:00Z")).toBe(
      false,
    );
  });

  it("rejects a valid time attributed to the wrong provider", () => {
    expect(isOfferedStartTime(tiers, "ps-exact", offered)).toBe(false);
  });

  it("rejects any time for a fallback student", () => {
    // Tier-3 rows have no validated slot, so they must never satisfy the `at`
    // check — otherwise a query string could book an unvetted time.
    expect(isOfferedStartTime(tiers, "ps-browse", offered)).toBe(false);
  });
});
