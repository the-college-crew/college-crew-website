import { describe, expect, it } from "vitest";

import {
  completenessScore,
  dailySeed,
  distanceMultiplier,
  isBeyondServiceRadius,
  jobsScore,
  recommendationScore,
  smoothedRatingScore,
  type RankingInput,
} from "./ranking";

describe("smoothedRatingScore", () => {
  it("returns the prior mean for a provider with no reviews", () => {
    // Prior mean is 4 stars → (4 - 1) / 4 = 0.75.
    expect(smoothedRatingScore(0, 0)).toBeCloseTo(0.75, 10);
  });

  it("lets a long, slightly-lower record beat a single perfect review", () => {
    const lonePerfect = smoothedRatingScore(5, 1);
    const provenTrack = smoothedRatingScore(4.8, 20);
    expect(provenTrack).toBeGreaterThan(lonePerfect);
  });

  it("cushions a provider's first bad review instead of tanking them", () => {
    const oneStarOnce = smoothedRatingScore(1, 1);
    // Without smoothing this would be 0; the prior keeps it well above the floor.
    expect(oneStarOnce).toBeGreaterThan(0.4);
  });

  it("stays within 0..1 for extreme inputs", () => {
    expect(smoothedRatingScore(5, 10000)).toBeLessThanOrEqual(1);
    expect(smoothedRatingScore(1, 10000)).toBeGreaterThanOrEqual(0);
  });
});

describe("jobsScore", () => {
  it("is zero with no completed jobs", () => {
    expect(jobsScore(0)).toBe(0);
  });

  it("grows fast early then flattens (log curve)", () => {
    const firstFive = jobsScore(5) - jobsScore(0);
    const nextFive = jobsScore(10) - jobsScore(5);
    expect(firstFive).toBeGreaterThan(nextFive);
  });

  it("saturates to 1 at and beyond the cap", () => {
    expect(jobsScore(25)).toBeCloseTo(1, 10);
    expect(jobsScore(1000)).toBe(1);
  });
});

describe("completenessScore", () => {
  it("rewards each signal independently", () => {
    expect(completenessScore({ hasBio: false, hasPreview: false })).toBe(0);
    expect(completenessScore({ hasBio: true, hasPreview: false })).toBe(0.5);
    expect(completenessScore({ hasBio: true, hasPreview: true })).toBe(1);
  });
});

describe("dailySeed", () => {
  it("is stable for the same provider and day", () => {
    expect(dailySeed("p1", "2026-07-15")).toBe(dailySeed("p1", "2026-07-15"));
  });

  it("rotates across days", () => {
    expect(dailySeed("p1", "2026-07-15")).not.toBe(dailySeed("p1", "2026-07-16"));
  });

  it("differs across providers on the same day", () => {
    expect(dailySeed("p1", "2026-07-15")).not.toBe(dailySeed("p2", "2026-07-15"));
  });

  it("stays within [0, 1)", () => {
    for (const id of ["a", "b", "c", "seed-xyz", "0000"]) {
      const v = dailySeed(id, "2026-07-15");
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe("distanceMultiplier", () => {
  it("applies the tier schedule", () => {
    expect(distanceMultiplier(0)).toBe(1);
    expect(distanceMultiplier(3)).toBe(1);
    expect(distanceMultiplier(4)).toBe(0.8);
    expect(distanceMultiplier(5)).toBe(0.8);
    expect(distanceMultiplier(6.5)).toBe(0.6);
    expect(distanceMultiplier(8)).toBe(0.6);
    expect(distanceMultiplier(9)).toBe(0.5);
    expect(distanceMultiplier(10)).toBe(0.5);
  });

  it("hard-cuts beyond the service radius", () => {
    expect(distanceMultiplier(10.1)).toBe(0);
    expect(distanceMultiplier(50)).toBe(0);
  });

  it("stays neutral when distance is unmeasurable", () => {
    expect(distanceMultiplier(null)).toBe(1);
  });
});

describe("isBeyondServiceRadius", () => {
  it("only flags measured, too-far providers", () => {
    expect(isBeyondServiceRadius(null)).toBe(false);
    expect(isBeyondServiceRadius(10)).toBe(false);
    expect(isBeyondServiceRadius(10.5)).toBe(true);
  });
});

describe("recommendationScore", () => {
  const base: RankingInput = {
    providerId: "p1",
    avgRating: 5,
    reviewCount: 20,
    completedJobs: 20,
    hasBio: true,
    hasPreview: true,
    distanceMiles: 1,
    dateKey: "2026-07-15",
  };

  it("ranks a strong nearby provider above a weak one", () => {
    const weak: RankingInput = {
      ...base,
      providerId: "p2",
      avgRating: 3,
      reviewCount: 2,
      completedJobs: 0,
      hasBio: false,
      hasPreview: false,
    };
    expect(recommendationScore(base)).toBeGreaterThan(recommendationScore(weak));
  });

  it("demotes an identical provider that is farther away", () => {
    const near = { ...base, distanceMiles: 1 };
    const far = { ...base, providerId: "p1", distanceMiles: 9 };
    expect(recommendationScore(near)).toBeGreaterThan(recommendationScore(far));
  });

  it("returns 0 for a provider beyond the service radius", () => {
    expect(recommendationScore({ ...base, distanceMiles: 20 })).toBe(0);
  });

  it("bounds day-to-day movement by the random weight", () => {
    // Same provider, same quality, only the day changes: the spread across a
    // month of daily seeds can never exceed RANDOM_WEIGHT (0.2).
    const scores = Array.from({ length: 31 }, (_, day) =>
      recommendationScore({
        ...base,
        dateKey: `2026-07-${String(day + 1).padStart(2, "0")}`,
      }),
    );
    const spread = Math.max(...scores) - Math.min(...scores);
    expect(spread).toBeGreaterThan(0);
    expect(spread).toBeLessThanOrEqual(0.2);
  });
});
