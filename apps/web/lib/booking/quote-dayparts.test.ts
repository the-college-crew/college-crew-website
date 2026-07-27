import { describe, expect, it } from "vitest";

import { availableQuoteDayparts, quoteDaypartContainsStart } from "./quote-dayparts";

const now = new Date("2026-07-27T12:00:00.000Z");

describe("quote dayparts", () => {
  it("uses daypart boundaries as start ranges", () => {
    expect(quoteDaypartContainsStart("morning", 8 * 60)).toBe(true);
    expect(quoteDaypartContainsStart("morning", 12 * 60)).toBe(false);
    expect(quoteDaypartContainsStart("afternoon", 12 * 60)).toBe(true);
    expect(quoteDaypartContainsStart("afternoon", 17 * 60)).toBe(true);
    expect(quoteDaypartContainsStart("either", 17 * 60 + 15)).toBe(false);
  });

  it("requires a continuous free hour beginning in the daypart", () => {
    const parts = availableQuoteDayparts({
      date: "2026-07-29",
      days: [{ date: "2026-07-29", startLocal: "08:00", endLocal: "17:00" }],
      busy: [
        {
          start: "2026-07-29T14:00:00.000Z",
          end: "2026-07-29T15:00:00.000Z",
        },
      ],
      now,
      minimumNoticeHours: 12,
    });
    expect(parts).toEqual(["morning", "afternoon", "either"]);
  });

  it("does not offer a short fragment", () => {
    expect(
      availableQuoteDayparts({
        date: "2026-07-29",
        days: [{ date: "2026-07-29", startLocal: "11:30", endLocal: "12:00" }],
        busy: [],
        now,
        minimumNoticeHours: 12,
      }),
    ).toEqual([]);
  });
});
