import { describe, expect, it } from "vitest";

import {
  isOfferedStartTime,
  pickSuggestions,
  type ReplacementSuggestion,
} from "./replacement-ranking";

const ORIGINAL = "2026-07-26T20:00:00Z";

function suggestion(
  overrides: Partial<ReplacementSuggestion> & { providerId: string },
): ReplacementSuggestion {
  return {
    providerServiceId: `ps-${overrides.providerId}`,
    providerName: `Student ${overrides.providerId}`,
    hourlyRateCents: 3000,
    rating: null,
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
    rating: avg == null ? null : { avg, count: 5 },
    suggestedStartAt: new Date(
      new Date(ORIGINAL).getTime() + hoursOff * 3_600_000,
    ).toISOString(),
  });
}

describe("pickSuggestions", () => {
  it("returns nothing when there is nobody to suggest", () => {
    expect(pickSuggestions({ exact: [], timeShift: [] }, ORIGINAL)).toEqual([]);
  });

  it("shows fewer than three rather than padding the list", () => {
    // The pilot has few students; 0, 1 or 2 suggestions is the normal case.
    const picked = pickSuggestions(
      { exact: [suggestion({ providerId: "a" })], timeShift: [] },
      ORIGINAL,
    );

    expect(picked).toHaveLength(1);
    expect(picked[0].suggestedStartAt).toBeNull();
  });

  it("caps the shortlist at three", () => {
    const picked = pickSuggestions(
      {
        exact: ["a", "b", "c", "d"].map((id) => suggestion({ providerId: id })),
        timeShift: [],
      },
      ORIGINAL,
    );

    expect(picked).toHaveLength(3);
  });

  it("prefers exact-time matches over any time change", () => {
    const picked = pickSuggestions(
      {
        exact: [suggestion({ providerId: "exact" })],
        timeShift: [shifted("shift", 0.5, 5)],
      },
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
      {
        exact: [],
        timeShift: [closestButPoor, bestRatedButFar, balanced, alsoRan],
      },
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
      {
        exact: [suggestion({ providerId: "a" }), suggestion({ providerId: "b" })],
        timeShift: [shifted("far-but-perfect", 48, 5), shifted("near-and-good", 1, 4.2)],
      },
      ORIGINAL,
    );

    expect(picked).toHaveLength(3);
    expect(picked[2].providerId).toBe("near-and-good");
  });

  it("treats an unrated student as neutral, not worst", () => {
    // Most pilot students have no reviews yet; ranking them last would bury
    // every new student behind anyone with a single mediocre rating.
    const unratedAndClose = shifted("new", 1, null);
    const ratedPoorlyAndClose = shifted("poorly-rated", 1.5, 1);

    const picked = pickSuggestions(
      { exact: [suggestion({ providerId: "x" }), suggestion({ providerId: "y" })], timeShift: [unratedAndClose, ratedPoorlyAndClose] },
      ORIGINAL,
    );

    expect(picked[2].providerId).toBe("new");
  });

  it("never suggests the same provider twice across tiers", () => {
    const picked = pickSuggestions(
      {
        exact: [suggestion({ providerId: "dup" })],
        timeShift: [shifted("dup", 2, 5), shifted("other", 3, 4)],
      },
      ORIGINAL,
    );

    expect(picked.filter((row) => row.providerId === "dup")).toHaveLength(1);
    expect(picked.map((row) => row.providerId)).toEqual(["dup", "other"]);
  });
});

describe("isOfferedStartTime", () => {
  const pool = {
    exact: [suggestion({ providerId: "exact" })],
    timeShift: [shifted("shift", 2, 4)],
  };
  const offered = pool.timeShift[0].suggestedStartAt!;

  it("accepts a time the database actually offered", () => {
    expect(isOfferedStartTime(pool, "ps-shift", offered)).toBe(true);
  });

  it("rejects a time nobody offered", () => {
    // Guards the ?at= query parameter: editing it must not book a slot outside
    // the provider's availability or notice window.
    expect(
      isOfferedStartTime(pool, "ps-shift", "2026-07-26T04:00:00Z"),
    ).toBe(false);
  });

  it("rejects a valid time attributed to the wrong provider", () => {
    expect(isOfferedStartTime(pool, "ps-exact", offered)).toBe(false);
  });
});
