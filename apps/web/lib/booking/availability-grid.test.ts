import { describe, expect, it } from "vitest";

import {
  SLOT_MINUTES,
  buildDayRail,
  buildMonthCells,
  clockToMinutes,
  expandWeeklyWindows,
  firstRunFitting,
  formatRangeSummary,
  formatUsDate,
  groupScheduleDays,
  longestFreeRunMinutes,
  maxEndMinutes,
  minutesToClock,
  pilotDateKey,
  shiftDateKey,
  toFormValues,
  validateRange,
  weekdayIndexForDate,
  type BusyInterval,
  type ScheduleDay,
} from "./availability-grid";
import { pilotLocalDateTimeToUtc } from "./policy";

/** Central Standard Time (UTC-6) helper: a local wall time as a real instant. */
function cst(date: string, clock: string) {
  const resolved = pilotLocalDateTimeToUtc(`${date}T${clock}`);
  if (!resolved.ok) throw new Error(`unresolvable local time ${date}T${clock}`);
  return resolved.date;
}

const NOTICE_HOURS = 12;

/** A plain 9-to-5 Wednesday, far enough out that notice never bites. */
const WORKDAY: ScheduleDay = {
  date: "2026-08-12",
  startLocal: "09:00:00",
  endLocal: "17:00:00",
};
/** Two days before the workday, so every slot clears the 12h cutoff. */
const WELL_BEFORE = cst("2026-08-10", "08:00");

function railFor(busy: BusyInterval[] = [], now = WELL_BEFORE) {
  return buildDayRail({
    day: WORKDAY,
    busy,
    now,
    minimumNoticeHours: NOTICE_HOURS,
  });
}

describe("clock helpers", () => {
  it("round-trips minutes and clock strings", () => {
    for (const clock of ["00:00", "09:15", "12:45", "23:45"]) {
      expect(minutesToClock(clockToMinutes(clock))).toBe(clock);
    }
  });

  it("ignores the seconds Postgres time values carry", () => {
    expect(clockToMinutes("09:30:00")).toBe(570);
  });

  it("formats a US date for the unavailable-day notice", () => {
    expect(formatUsDate("2026-07-28")).toBe("07/28/2026");
  });

  it("reads the local date of an instant in the pilot zone, not the host zone", () => {
    // 01:30 UTC on the 13th is still 20:30 on the 12th in Chicago.
    expect(pilotDateKey("2026-08-13T01:30:00.000Z")).toBe("2026-08-12");
  });

  it("shifts date keys across month and year ends", () => {
    expect(shiftDateKey("2026-08-31", 1)).toBe("2026-09-01");
    expect(shiftDateKey("2026-12-31", 1)).toBe("2027-01-01");
    expect(shiftDateKey("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("encodes weekdays Monday zero through Sunday six", () => {
    // 2026-08-10 is a Monday.
    expect(weekdayIndexForDate("2026-08-10")).toBe(0);
    expect(weekdayIndexForDate("2026-08-15")).toBe(5);
    expect(weekdayIndexForDate("2026-08-16")).toBe(6);
  });
});

describe("expandWeeklyWindows", () => {
  const windows = [
    { weekday: 0, start_local: "15:00:00", end_local: "20:00:00" },
    { weekday: 4, start_local: "09:00:00", end_local: "16:00:00" },
  ];

  it("projects every period of a weekday, not just the first", () => {
    const split = [
      { weekday: 0, start_local: "09:00", end_local: "12:00" },
      { weekday: 0, start_local: "16:00", end_local: "20:00" },
    ];
    expect(expandWeeklyWindows(split, "2026-08-10", 1)).toEqual([
      { date: "2026-08-10", startLocal: "09:00", endLocal: "12:00" },
      { date: "2026-08-10", startLocal: "16:00", endLocal: "20:00" },
    ]);
  });

  it("projects recurring windows onto the dates they land on", () => {
    // 2026-08-10 is a Monday, so the Monday and Friday windows both appear.
    expect(expandWeeklyWindows(windows, "2026-08-10", 7)).toEqual([
      { date: "2026-08-10", startLocal: "15:00:00", endLocal: "20:00:00" },
      { date: "2026-08-14", startLocal: "09:00:00", endLocal: "16:00:00" },
      { date: "2026-08-17", startLocal: "15:00:00", endLocal: "20:00:00" },
    ]);
  });

  it("returns nothing when no weekday has a window", () => {
    expect(expandWeeklyWindows([], "2026-08-10", 30)).toEqual([]);
  });
});

describe("buildDayRail", () => {
  it("covers the window in 15-minute slots and stops before the end", () => {
    const rail = railFor();
    expect(SLOT_MINUTES).toBe(15);
    expect(rail.slots).toHaveLength((17 - 9) * 4);
    expect(rail.slots[0].startMinutes).toBe(9 * 60);
    expect(rail.slots[0].label).toBe("9:00 AM");
    // The last slot starts at 16:45 and ends exactly on the window close.
    expect(rail.slots.at(-1)?.startMinutes).toBe(16 * 60 + 45);
    expect(rail.endMinutes).toBe(17 * 60);
  });

  it("marks an hour line for every whole hour in the window", () => {
    expect(railFor().hourMarks).toEqual([
      9 * 60, 10 * 60, 11 * 60, 12 * 60, 13 * 60, 14 * 60, 15 * 60, 16 * 60,
      17 * 60,
    ]);
  });

  it("blocks slots overlapping a reserved job", () => {
    const rail = railFor([
      {
        start: cst("2026-08-12", "11:00").toISOString(),
        end: cst("2026-08-12", "12:30").toISOString(),
      },
    ]);
    const blocked = rail.slots.filter((slot) => slot.blocked);
    expect(blocked.map((slot) => slot.startMinutes)).toEqual([
      11 * 60,
      11 * 60 + 15,
      11 * 60 + 30,
      11 * 60 + 45,
      12 * 60,
      12 * 60 + 15,
    ]);
    expect(new Set(blocked.map((slot) => slot.reason))).toEqual(new Set(["busy"]));
    // The slot ending exactly when the job starts stays free.
    expect(
      rail.slots.find((slot) => slot.startMinutes === 10 * 60 + 45)?.blocked,
    ).toBe(false);
  });

  it("blocks slots inside the minimum-notice cutoff", () => {
    // 08:00 on the day itself: the 12h cutoff lands at 20:00, past the window.
    const rail = railFor([], cst("2026-08-12", "08:00"));
    expect(rail.slots.every((slot) => slot.blocked)).toBe(true);
    expect(new Set(rail.slots.map((slot) => slot.reason))).toEqual(
      new Set(["notice"]),
    );
  });

  it("frees only the slots past the cutoff when it lands mid-window", () => {
    // 01:00 on the day: the cutoff is 13:00, so 13:00 onward is bookable.
    const rail = railFor([], cst("2026-08-12", "01:00"));
    const free = rail.slots.filter((slot) => !slot.blocked);
    expect(free[0].startMinutes).toBe(13 * 60);
    expect(free).toHaveLength((17 - 13) * 4);
  });

  it("prefers the busy reason when a slot is both booked and too soon", () => {
    const rail = railFor(
      [
        {
          start: cst("2026-08-12", "09:00").toISOString(),
          end: cst("2026-08-12", "10:00").toISOString(),
        },
      ],
      cst("2026-08-12", "01:00"),
    );
    expect(rail.slots[0].reason).toBe("busy");
  });
});

describe("DST transition days", () => {
  it("blocks the wall-clock hour that spring-forward skips", () => {
    // 2026-03-08: 02:00 to 02:59 local does not exist.
    const rail = buildDayRail({
      day: { date: "2026-03-08", startLocal: "01:00", endLocal: "05:00" },
      busy: [],
      now: cst("2026-03-01", "08:00"),
      minimumNoticeHours: NOTICE_HOURS,
    });
    const skipped = rail.slots.filter((slot) => slot.reason === "dst");
    expect(skipped.map((slot) => slot.startMinutes)).toEqual([
      2 * 60,
      2 * 60 + 15,
      2 * 60 + 30,
      2 * 60 + 45,
    ]);
    // Everything outside the gap is still offered.
    expect(rail.slots.filter((slot) => !slot.blocked)).toHaveLength(
      rail.slots.length - 4,
    );
  });

  it("blocks the ambiguous hour that fall-back repeats", () => {
    // 2026-11-01: 01:00 to 01:59 local happens twice.
    const rail = buildDayRail({
      day: { date: "2026-11-01", startLocal: "00:00", endLocal: "05:00" },
      busy: [],
      now: cst("2026-10-25", "08:00"),
      minimumNoticeHours: NOTICE_HOURS,
    });
    const ambiguous = rail.slots.filter((slot) => slot.reason === "dst");
    expect(ambiguous.map((slot) => slot.startMinutes)).toEqual([
      60, 75, 90, 105,
    ]);
  });

  it("never offers a slot the server-side conversion would reject", () => {
    for (const date of ["2026-03-08", "2026-11-01"]) {
      const rail = buildDayRail({
        day: { date, startLocal: "00:00", endLocal: "06:00" },
        busy: [],
        now: cst("2026-02-01", "08:00"),
        minimumNoticeHours: NOTICE_HOURS,
      });
      for (const slot of rail.slots) {
        if (slot.blocked) continue;
        const { scheduledLocal } = toFormValues(
          date,
          slot.startMinutes,
          slot.startMinutes + 60,
        );
        expect(pilotLocalDateTimeToUtc(scheduledLocal).ok).toBe(true);
      }
    }
  });
});

describe("several periods in one day", () => {
  /** Mornings before class, evenings after: one date, two disjoint periods. */
  const SPLIT: ScheduleDay[] = [
    { date: "2026-08-12", startLocal: "09:00", endLocal: "12:00" },
    { date: "2026-08-12", startLocal: "16:00", endLocal: "20:00" },
  ];

  function splitRail(busy: BusyInterval[] = []) {
    return buildDayRail({
      day: SPLIT,
      busy,
      now: WELL_BEFORE,
      minimumNoticeHours: NOTICE_HOURS,
    });
  }

  it("spans the first period's start to the last period's end", () => {
    const rail = splitRail();
    expect(rail.startMinutes).toBe(9 * 60);
    expect(rail.endMinutes).toBe(20 * 60);
    expect(rail.slots).toHaveLength((20 - 9) * 4);
  });

  it("blocks the gap between periods", () => {
    const gap = splitRail().slots.filter((slot) => slot.reason === "gap");
    expect(gap[0].startMinutes).toBe(12 * 60);
    expect(gap.at(-1)?.startMinutes).toBe(15 * 60 + 45);
    expect(gap).toHaveLength((16 - 12) * 4);
  });

  it("leaves both periods fully selectable", () => {
    const free = splitRail().slots.filter((slot) => !slot.blocked);
    expect(free[0].startMinutes).toBe(9 * 60);
    expect(free.at(-1)?.startMinutes).toBe(19 * 60 + 45);
    expect(free).toHaveLength((12 - 9) * 4 + (20 - 16) * 4);
  });

  it("accepts a booking inside either period", () => {
    const rail = splitRail();
    expect(validateRange(rail, 9 * 60, 11 * 60)).toEqual({ ok: true });
    expect(validateRange(rail, 17 * 60, 19 * 60)).toEqual({ ok: true });
  });

  it("refuses a booking that straddles the gap, matching the server", () => {
    expect(validateRange(splitRail(), 11 * 60, 17 * 60)).toEqual({
      ok: false,
      reason: "crosses-blocked",
    });
  });

  it("stops a drag at the end of the period it started in", () => {
    expect(maxEndMinutes(splitRail(), 10 * 60)).toBe(12 * 60);
  });

  it("measures the longest run within a single period", () => {
    expect(longestFreeRunMinutes(splitRail().slots)).toBe(4 * 60);
  });

  it("counts the day open when either period still fits a job", () => {
    const cells = buildMonthCells({
      monthStart: new Date(2026, 7, 1),
      now: WELL_BEFORE,
      days: SPLIT,
      busy: [
        {
          start: cst("2026-08-12", "09:00").toISOString(),
          end: cst("2026-08-12", "12:00").toISOString(),
        },
      ],
      minimumNoticeHours: NOTICE_HOURS,
    });
    const cell = cells.find((entry) => entry?.date === "2026-08-12");
    expect(cell?.state).toBe("open");
  });

  it("counts the day full when every period is taken", () => {
    const cells = buildMonthCells({
      monthStart: new Date(2026, 7, 1),
      now: WELL_BEFORE,
      days: SPLIT,
      busy: [
        {
          start: cst("2026-08-12", "09:00").toISOString(),
          end: cst("2026-08-12", "20:00").toISOString(),
        },
      ],
      minimumNoticeHours: NOTICE_HOURS,
    });
    expect(cells.find((entry) => entry?.date === "2026-08-12")?.state).toBe("full");
  });
});

describe("groupScheduleDays", () => {
  it("collects a date's periods and orders them by start time", () => {
    const grouped = groupScheduleDays([
      { date: "2026-08-12", startLocal: "16:00", endLocal: "20:00" },
      { date: "2026-08-13", startLocal: "09:00", endLocal: "17:00" },
      { date: "2026-08-12", startLocal: "09:00", endLocal: "12:00" },
    ]);
    expect(grouped.get("2026-08-12")?.map((period) => period.startLocal)).toEqual([
      "09:00",
      "16:00",
    ]);
    expect(grouped.get("2026-08-13")).toHaveLength(1);
  });
});

describe("longestFreeRunMinutes", () => {
  it("measures the longest uninterrupted run", () => {
    const rail = railFor([
      {
        start: cst("2026-08-12", "12:00").toISOString(),
        end: cst("2026-08-12", "13:00").toISOString(),
      },
    ]);
    // 09:00-12:00 is three hours; 13:00-17:00 is four.
    expect(longestFreeRunMinutes(rail.slots)).toBe(4 * 60);
  });

  it("returns zero when every slot is blocked", () => {
    expect(longestFreeRunMinutes(railFor([], cst("2026-08-12", "08:00")).slots)).toBe(
      0,
    );
  });
});

describe("buildMonthCells", () => {
  const now = cst("2026-08-12", "08:00");

  function cellsFor(days: ScheduleDay[], busy: BusyInterval[] = []) {
    const cells = buildMonthCells({
      monthStart: new Date(2026, 7, 1),
      now,
      days,
      busy,
      minimumNoticeHours: NOTICE_HOURS,
    });
    return new Map(
      cells.filter((cell) => cell !== null).map((cell) => [cell!.date, cell!]),
    );
  }

  it("pads the leading blanks so the 1st lands under its weekday", () => {
    const cells = buildMonthCells({
      monthStart: new Date(2026, 7, 1),
      now,
      days: [],
      busy: [],
      minimumNoticeHours: NOTICE_HOURS,
    });
    // 2026-08-01 is a Saturday, so six blanks precede it.
    expect(cells.slice(0, 6).every((cell) => cell === null)).toBe(true);
    expect(cells[6]?.date).toBe("2026-08-01");
    expect(cells.filter((cell) => cell !== null)).toHaveLength(31);
  });

  it("marks elapsed days past and flags today", () => {
    const cells = cellsFor([]);
    expect(cells.get("2026-08-11")?.state).toBe("past");
    expect(cells.get("2026-08-12")?.isToday).toBe(true);
    expect(cells.get("2026-08-11")?.isToday).toBe(false);
  });

  it("marks a day with no window closed", () => {
    expect(cellsFor([]).get("2026-08-20")?.state).toBe("closed");
  });

  it("marks a day with a usable run open", () => {
    const cells = cellsFor([{ ...WORKDAY, date: "2026-08-20" }]);
    expect(cells.get("2026-08-20")?.state).toBe("open");
  });

  it("marks a fully booked day full", () => {
    const cells = cellsFor(
      [{ ...WORKDAY, date: "2026-08-20" }],
      [
        {
          start: cst("2026-08-20", "09:00").toISOString(),
          end: cst("2026-08-20", "17:00").toISOString(),
        },
      ],
    );
    expect(cells.get("2026-08-20")?.state).toBe("full");
  });

  it("marks a day full when the gaps are shorter than the one-hour minimum", () => {
    const cells = cellsFor(
      [{ ...WORKDAY, date: "2026-08-20" }],
      [
        {
          start: cst("2026-08-20", "09:45").toISOString(),
          end: cst("2026-08-20", "16:30").toISOString(),
        },
      ],
    );
    expect(cells.get("2026-08-20")?.state).toBe("full");
  });

  it("marks today past once the notice cutoff has eaten the window", () => {
    const cells = cellsFor([WORKDAY]);
    expect(cells.get("2026-08-12")?.state).toBe("past");
  });

  it("marks a window shorter than the minimum closed, not past", () => {
    const cells = cellsFor([
      { date: "2026-08-20", startLocal: "09:00", endLocal: "09:45" },
    ]);
    expect(cells.get("2026-08-20")?.state).toBe("closed");
  });
});

describe("validateRange", () => {
  const rail = railFor([
    {
      start: cst("2026-08-12", "13:00").toISOString(),
      end: cst("2026-08-12", "14:00").toISOString(),
    },
  ]);

  it("accepts a clean one-hour range", () => {
    expect(validateRange(rail, 9 * 60, 10 * 60)).toEqual({ ok: true });
  });

  it("accepts a quarter-hour range longer than the minimum", () => {
    expect(validateRange(rail, 9 * 60, 11 * 60 + 45)).toEqual({ ok: true });
  });

  it("rejects anything under the one-hour minimum", () => {
    expect(validateRange(rail, 9 * 60, 9 * 60 + 45)).toEqual({
      ok: false,
      reason: "too-short",
    });
  });

  it("rejects anything over the twelve-hour maximum", () => {
    const wide = buildDayRail({
      day: { date: "2026-08-20", startLocal: "06:00", endLocal: "22:00" },
      busy: [],
      now: WELL_BEFORE,
      minimumNoticeHours: NOTICE_HOURS,
    });
    expect(validateRange(wide, 6 * 60, 21 * 60)).toEqual({
      ok: false,
      reason: "too-long",
    });
  });

  it("rejects a range that is not a multiple of fifteen minutes", () => {
    expect(validateRange(rail, 9 * 60, 10 * 60 + 5)).toEqual({
      ok: false,
      reason: "not-increment",
    });
  });

  it("rejects a range that runs past the end of the window", () => {
    expect(validateRange(rail, 16 * 60, 18 * 60)).toEqual({
      ok: false,
      reason: "outside-window",
    });
  });

  it("rejects a range that swallows a booked block", () => {
    expect(validateRange(rail, 12 * 60, 15 * 60)).toEqual({
      ok: false,
      reason: "crosses-blocked",
    });
  });

  it("accepts a range ending exactly where a booked block begins", () => {
    expect(validateRange(rail, 12 * 60, 13 * 60)).toEqual({ ok: true });
  });
});

describe("selection helpers", () => {
  const rail = railFor([
    {
      start: cst("2026-08-12", "13:00").toISOString(),
      end: cst("2026-08-12", "14:00").toISOString(),
    },
  ]);

  it("clamps the reachable end at the next blocked slot", () => {
    expect(maxEndMinutes(rail, 11 * 60)).toBe(13 * 60);
  });

  it("clamps the reachable end at the window close", () => {
    expect(maxEndMinutes(rail, 14 * 60)).toBe(17 * 60);
  });

  it("finds the first run long enough for a repeat booking", () => {
    expect(firstRunFitting(rail, 3 * 60)).toEqual({
      startMinutes: 9 * 60,
      endMinutes: 12 * 60,
    });
  });

  it("skips a run that is too short and takes the next one", () => {
    const tight = railFor([
      {
        start: cst("2026-08-12", "10:00").toISOString(),
        end: cst("2026-08-12", "11:00").toISOString(),
      },
    ]);
    expect(firstRunFitting(tight, 2 * 60)).toEqual({
      startMinutes: 11 * 60,
      endMinutes: 13 * 60,
    });
  });

  it("returns null when nothing fits", () => {
    expect(firstRunFitting(rail, 12 * 60)).toBeNull();
  });
});

describe("toFormValues", () => {
  it("produces exactly the pair the server action parses", () => {
    expect(toFormValues("2026-08-12", 13 * 60 + 30, 15 * 60 + 15)).toEqual({
      scheduledLocal: "2026-08-12T13:30",
      estimatedMinutes: 105,
    });
  });

  it("round-trips to the same instant the server derives", () => {
    const { scheduledLocal } = toFormValues("2026-08-12", 13 * 60 + 30, 15 * 60);
    const resolved = pilotLocalDateTimeToUtc(scheduledLocal);
    expect(resolved.ok).toBe(true);
    expect(resolved.ok && resolved.date.toISOString()).toBe(
      cst("2026-08-12", "13:30").toISOString(),
    );
  });

  it("summarizes the range without an em dash", () => {
    const summary = formatRangeSummary(11 * 60, 12 * 60 + 45);
    expect(summary).toBe("11:00 AM - 12:45 PM · 1 hr 45 min");
    expect(summary).not.toMatch(/[—–]/);
  });
});
