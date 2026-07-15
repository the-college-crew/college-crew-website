import { describe, expect, it } from "vitest";

import { formatMiles, haversineMiles, milesBetween } from "./distance";

// Reference points checked against published great-circle distances.
const CHICAGO = { latitude: 41.8781, longitude: -87.6298 };
const EVANSTON = { latitude: 42.0451, longitude: -87.6877 };
const NYC = { latitude: 40.7128, longitude: -74.006 };

describe("haversineMiles", () => {
  it("is zero for identical points", () => {
    expect(haversineMiles(CHICAGO, CHICAGO)).toBe(0);
  });

  it("matches known city distances within tolerance", () => {
    expect(haversineMiles(CHICAGO, EVANSTON)).toBeGreaterThan(11);
    expect(haversineMiles(CHICAGO, EVANSTON)).toBeLessThan(13.5);
    expect(haversineMiles(CHICAGO, NYC)).toBeGreaterThan(700);
    expect(haversineMiles(CHICAGO, NYC)).toBeLessThan(730);
  });

  it("is symmetric", () => {
    expect(haversineMiles(CHICAGO, NYC)).toBeCloseTo(
      haversineMiles(NYC, CHICAGO),
      10,
    );
  });
});

describe("formatMiles", () => {
  it("shows one decimal under ten miles", () => {
    expect(formatMiles(2.34)).toBe("2.3 mi");
    expect(formatMiles(9.96)).toBe("10 mi");
  });

  it("never reads zero", () => {
    expect(formatMiles(0.01)).toBe("0.1 mi");
    expect(formatMiles(0)).toBe("0.1 mi");
  });

  it("rounds whole miles at ten and above", () => {
    expect(formatMiles(14.5)).toBe("15 mi");
  });

  it("returns empty for invalid input", () => {
    expect(formatMiles(Number.NaN)).toBe("");
    expect(formatMiles(-1)).toBe("");
  });
});

describe("milesBetween", () => {
  it("returns null when either side is missing coordinates", () => {
    expect(milesBetween(null, CHICAGO)).toBeNull();
    expect(milesBetween(CHICAGO, { latitude: 41, longitude: null as unknown as number })).toBeNull();
  });

  it("computes when both sides are present", () => {
    expect(milesBetween(CHICAGO, EVANSTON)).not.toBeNull();
  });
});
