/**
 * Pure calendar math for the booking scheduler: which days are bookable, which
 * 15-minute slots inside a day are free, and whether a chosen range is valid.
 *
 * This is a client-side mirror of the server guards, not a second source of
 * truth. It must never offer a slot `private.assert_hourly_offering_slot` would
 * reject, and never hide one it would accept. Everything here is local to
 * `PILOT_TIME_ZONE`; the single conversion back to an instant happens in
 * `pilotLocalDateTimeToUtc`, exactly as the server action does it.
 */

import {
  BILLING_INCREMENT_MINUTES,
  CUSTOMER_ESTIMATE_MINUTES,
  getPilotLocalParts,
  pilotLocalDateTimeToUtc,
} from "./policy";

export const SLOT_MINUTES = BILLING_INCREMENT_MINUTES;

/**
 * One open period from `provider_schedule_days`. `date` is `YYYY-MM-DD`, and a
 * date can appear more than once: a student may work 9-12 and 4-8 on the same
 * day. Periods on a date never overlap, which the save RPCs enforce.
 */
export type ScheduleDay = {
  date: string;
  startLocal: string;
  endLocal: string;
};

/** One reserved range from `provider_busy_intervals`, both UTC ISO. */
export type BusyInterval = { start: string; end: string };

export type DayState =
  /** Bookable: has an open window with at least one usable run left in it. */
  | "open"
  /** Elapsed, or entirely inside the minimum-notice cutoff. */
  | "past"
  /** The provider is not working that day at all. */
  | "closed"
  /** Open, but nothing long enough survives existing jobs. */
  | "full";

export type MonthCell = {
  date: string;
  dayOfMonth: number;
  isToday: boolean;
  state: DayState;
};

export type SlotBlockReason =
  | "busy"
  | "notice"
  | "dst"
  /** Between two of the day's periods: the student isn't working then. */
  | "gap";

export type RailSlot = {
  /** Local minutes from midnight; the slot covers [startMinutes, +SLOT_MINUTES). */
  startMinutes: number;
  label: string;
  blocked: boolean;
  reason?: SlotBlockReason;
};

export type DayRail = {
  date: string;
  slots: RailSlot[];
  /** Local minutes from midnight for each labelled hour line. */
  hourMarks: number[];
  startMinutes: number;
  endMinutes: number;
};

export type RangeError =
  | "too-short"
  | "too-long"
  | "not-increment"
  | "crosses-blocked"
  | "outside-window";

const MS_PER_MINUTE = 60_000;

/* ------------------------------------------------------------------ *
 * Local date helpers. All of these work on `YYYY-MM-DD` strings so no
 * host-timezone Date ever leaks into the comparison.
 * ------------------------------------------------------------------ */

export function toLocalDateKey(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** The `YYYY-MM-DD` an instant falls on in the pilot timezone. */
export function pilotDateKey(value: Date | string | number) {
  const parts = getPilotLocalParts(value);
  return toLocalDateKey(parts.year, parts.month, parts.day);
}

/** Add days to a `YYYY-MM-DD` key without touching the host timezone. */
export function shiftDateKey(date: string, days: number) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days))
    .toISOString()
    .slice(0, 10);
}

/**
 * Weekday of a `YYYY-MM-DD` key in the project's encoding: Monday 0 through
 * Sunday 6, matching `provider_availability_windows.weekday`.
 */
export function weekdayIndexForDate(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return (new Date(Date.UTC(year, month - 1, day)).getUTCDay() + 6) % 7;
}

/**
 * Project recurring weekly windows onto real dates. The server resolves this
 * itself (per-date overrides included) for anything that can be booked; this is
 * for surfaces with no saved provider yet, like the sample preview and the
 * live preview in the availability editor.
 */
export function expandWeeklyWindows(
  windows: readonly { weekday: number; start_local: string; end_local: string }[],
  fromDate: string,
  days: number,
): ScheduleDay[] {
  const byWeekday = new Map<number, typeof windows>();
  for (const window of windows) {
    byWeekday.set(window.weekday, [
      ...(byWeekday.get(window.weekday) ?? []),
      window,
    ]);
  }

  const result: ScheduleDay[] = [];
  for (let offset = 0; offset <= days; offset++) {
    const date = shiftDateKey(fromDate, offset);
    for (const window of byWeekday.get(weekdayIndexForDate(date)) ?? []) {
      result.push({
        date,
        startLocal: window.start_local,
        endLocal: window.end_local,
      });
    }
  }
  return result;
}

/** Group periods by local date, each date's periods sorted by start time. */
export function groupScheduleDays(days: readonly ScheduleDay[]) {
  const byDate = new Map<string, ScheduleDay[]>();
  for (const day of days) {
    const list = byDate.get(day.date);
    if (list) list.push(day);
    else byDate.set(day.date, [day]);
  }
  for (const list of byDate.values()) {
    list.sort((a, b) => clockToMinutes(a.startLocal) - clockToMinutes(b.startLocal));
  }
  return byDate;
}

/** Where an instant falls in the pilot day: its date key and minutes from midnight. */
export function pilotDatePosition(value: Date | string | number) {
  const parts = getPilotLocalParts(value);
  return {
    date: toLocalDateKey(parts.year, parts.month, parts.day),
    minutes: parts.hour * 60 + parts.minute,
  };
}

/** Local minutes from midnight for a `HH:MM[:SS]` clock string. */
export function clockToMinutes(value: string) {
  const [hours, minutes] = value.slice(0, 5).split(":").map(Number);
  return hours * 60 + minutes;
}

export function minutesToClock(minutes: number) {
  const hours = Math.floor(minutes / 60);
  return `${String(hours).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

export function formatSlotLabel(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const period = hours >= 12 ? "PM" : "AM";
  const displayHour = hours % 12 || 12;
  return `${displayHour}:${String(minutes % 60).padStart(2, "0")} ${period}`;
}

/** Compact gutter form: `10 AM` on the hour, `9:30 AM` otherwise. */
export function formatHourLabel(minutes: number) {
  return minutes % 60 === 0
    ? formatSlotLabel(minutes).replace(":00", "")
    : formatSlotLabel(minutes);
}

export function formatDurationLabel(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (hours === 0) return `${remainder} min`;
  const hourPart = `${hours} hr${hours === 1 ? "" : "s"}`;
  return remainder ? `${hourPart} ${remainder} min` : hourPart;
}

/* ------------------------------------------------------------------ *
 * Local wall clock to instant.
 * ------------------------------------------------------------------ */

/**
 * UTC offset in minutes at a given local wall time, or null when that wall time
 * doesn't exist or happens twice. Resolving one instant per day boundary and
 * reusing the offset keeps the common case cheap; the expensive per-slot search
 * only runs on the two DST transition days a year.
 */
function offsetMinutesAt(date: string, minutes: number): number | null {
  const resolved = pilotLocalDateTimeToUtc(`${date}T${minutesToClock(minutes)}`);
  if (!resolved.ok) return null;
  const wallClockUtc = Date.parse(`${date}T${minutesToClock(minutes)}:00.000Z`);
  return (wallClockUtc - resolved.date.getTime()) / MS_PER_MINUTE;
}

/** The instant a local slot starts at, or null across a DST discontinuity. */
export function localSlotInstant(
  date: string,
  minutes: number,
  offsetMinutes?: number | null,
): Date | null {
  if (offsetMinutes != null) {
    const wallClockUtc = Date.parse(
      `${date}T${minutesToClock(minutes)}:00.000Z`,
    );
    return new Date(wallClockUtc - offsetMinutes * MS_PER_MINUTE);
  }
  const resolved = pilotLocalDateTimeToUtc(
    `${date}T${minutesToClock(minutes)}`,
  );
  return resolved.ok ? resolved.date : null;
}

/* ------------------------------------------------------------------ *
 * Busy intervals.
 * ------------------------------------------------------------------ */

type BusyRange = { start: number; end: number };

function toEpochRanges(busy: readonly BusyInterval[]): BusyRange[] {
  return busy
    .map((interval) => ({
      start: Date.parse(interval.start),
      end: Date.parse(interval.end),
    }))
    .filter((range) => Number.isFinite(range.start) && Number.isFinite(range.end))
    .sort((a, b) => a.start - b.start);
}

function overlapsBusy(
  ranges: readonly BusyRange[],
  startMs: number,
  endMs: number,
) {
  return ranges.some((range) => range.start < endMs && range.end > startMs);
}

/* ------------------------------------------------------------------ *
 * The day rail.
 * ------------------------------------------------------------------ */

/**
 * Every 15-minute slot across a day's open periods, flagged where it can't
 * start a booking. A slot is blocked when it falls between two periods, overlaps
 * a reserved job, falls inside the provider's minimum-notice cutoff, or is a
 * wall-clock time that DST skips.
 *
 * The rail spans the first period's start to the last period's end, so a day
 * with a break in it reads as one continuous day with the break greyed out
 * rather than as two disconnected rails.
 */
export function buildDayRail(input: {
  /** Every period on one date. Passing a single period is the common case. */
  day: ScheduleDay | readonly ScheduleDay[];
  busy: readonly BusyInterval[];
  now: Date;
  minimumNoticeHours: number;
}): DayRail {
  const { now, minimumNoticeHours } = input;
  const periods = (Array.isArray(input.day) ? input.day : [input.day]) as
    readonly ScheduleDay[];
  const ranges = periods
    .map((period) => ({
      start: clockToMinutes(period.startLocal),
      end: clockToMinutes(period.endLocal),
    }))
    .sort((a, b) => a.start - b.start);

  const day = periods[0];
  const startMinutes = ranges[0].start;
  const endMinutes = ranges[ranges.length - 1].end;
  const inAPeriod = (minutes: number) =>
    ranges.some((range) => minutes >= range.start && minutes < range.end);
  const busyRanges = toEpochRanges(input.busy);
  const earliestStartMs = now.getTime() + minimumNoticeHours * 60 * MS_PER_MINUTE;

  // One offset for the whole day unless it crosses a transition, in which case
  // fall back to resolving each slot individually.
  const startOffset = offsetMinutesAt(day.date, startMinutes);
  const endOffset = offsetMinutesAt(day.date, Math.max(startMinutes, endMinutes - 1));
  const stableOffset =
    startOffset != null && startOffset === endOffset ? startOffset : null;

  const slots: RailSlot[] = [];
  for (
    let minutes = startMinutes;
    minutes + SLOT_MINUTES <= endMinutes;
    minutes += SLOT_MINUTES
  ) {
    if (!inAPeriod(minutes)) {
      slots.push({
        startMinutes: minutes,
        label: formatSlotLabel(minutes),
        blocked: true,
        reason: "gap",
      });
      continue;
    }

    const instant = localSlotInstant(day.date, minutes, stableOffset);
    if (!instant) {
      slots.push({
        startMinutes: minutes,
        label: formatSlotLabel(minutes),
        blocked: true,
        reason: "dst",
      });
      continue;
    }

    const slotStartMs = instant.getTime();
    const slotEndMs = slotStartMs + SLOT_MINUTES * MS_PER_MINUTE;
    const reason: SlotBlockReason | undefined = overlapsBusy(
      busyRanges,
      slotStartMs,
      slotEndMs,
    )
      ? "busy"
      : slotStartMs < earliestStartMs
        ? "notice"
        : undefined;

    slots.push({
      startMinutes: minutes,
      label: formatSlotLabel(minutes),
      blocked: reason !== undefined,
      reason,
    });
  }

  const hourMarks: number[] = [];
  for (
    let mark = Math.ceil(startMinutes / 60) * 60;
    mark <= endMinutes;
    mark += 60
  ) {
    hourMarks.push(mark);
  }

  return { date: day.date, slots, hourMarks, startMinutes, endMinutes };
}

/** The longest run of consecutive free slots, in minutes. */
export function longestFreeRunMinutes(slots: readonly RailSlot[]) {
  let best = 0;
  let current = 0;
  for (const slot of slots) {
    current = slot.blocked ? 0 : current + SLOT_MINUTES;
    if (current > best) best = current;
  }
  return best;
}

/* ------------------------------------------------------------------ *
 * The month grid.
 * ------------------------------------------------------------------ */

/**
 * One month of cells, with leading nulls for the blanks before the 1st so the
 * grid lines up under a Sun..Sat header.
 *
 * `monthStart` is read for its year and month only; the day classification is
 * done entirely on local date keys, so the host timezone never shifts a cell.
 */
export function buildMonthCells(input: {
  monthStart: Date;
  now: Date;
  days: readonly ScheduleDay[];
  busy: readonly BusyInterval[];
  minimumNoticeHours: number;
  /** Shortest bookable job; a day with no run this long counts as full. */
  minMinutes?: number;
  /** A fixed-duration quote may run this far past the end of one work period. */
  availabilityEndOverrunMinutes?: number;
}): Array<MonthCell | null> {
  const {
    monthStart,
    now,
    days,
    busy,
    minimumNoticeHours,
    minMinutes = CUSTOMER_ESTIMATE_MINUTES.min,
    availabilityEndOverrunMinutes = 0,
  } = input;

  const year = monthStart.getFullYear();
  const month = monthStart.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const leadingBlanks = new Date(year, month, 1).getDay();
  const todayKey = pilotDateKey(now);

  const openDays = groupScheduleDays(days);
  const cells: Array<MonthCell | null> = Array.from(
    { length: leadingBlanks },
    () => null,
  );

  for (let dayOfMonth = 1; dayOfMonth <= daysInMonth; dayOfMonth++) {
    const date = toLocalDateKey(year, month + 1, dayOfMonth);
    const periods = openDays.get(date);
    let state: DayState;

    if (date < todayKey) {
      state = "past";
    } else if (!periods) {
      state = "closed";
    } else {
      const rail = buildDayRail({ day: periods, busy, now, minimumNoticeHours });
      const hasFittingTime = availabilityEndOverrunMinutes > 0
        ? rail.slots.some((slot) =>
            fixedDurationStartIsAvailable({
              rail,
              periods,
              busy,
              startMinutes: slot.startMinutes,
              durationMinutes: minMinutes,
              availabilityEndOverrunMinutes,
            }),
          )
        : longestFreeRunMinutes(rail.slots) >= minMinutes;
      if (hasFittingTime) {
        state = "open";
      } else if (rail.slots.some((slot) => slot.reason === "busy")) {
        // Someone else has the day. Worth saying so, since it may free up.
        state = "full";
      } else if (rail.slots.some((slot) => slot.reason === "notice")) {
        // Nothing left today only because of the notice cutoff.
        state = "past";
      } else {
        // Every period is too short to hold the shortest bookable job.
        state = "closed";
      }
    }

    cells.push({
      date,
      dayOfMonth,
      isToday: date === todayKey,
      state,
    });
  }

  return cells;
}

/* ------------------------------------------------------------------ *
 * Range selection.
 * ------------------------------------------------------------------ */

/**
 * How long a selected range may run. Booking uses the database's own bounds;
 * the availability editor authors a window, where anything from one slot to a
 * whole day is legitimate.
 */
export type DurationBounds = { min: number; max: number };

export const BOOKING_DURATION_BOUNDS: DurationBounds = CUSTOMER_ESTIMATE_MINUTES;
export const WINDOW_DURATION_BOUNDS: DurationBounds = {
  min: SLOT_MINUTES,
  max: 24 * 60,
};

/**
 * Validate a selected range: a multiple of 15, within the duration bounds,
 * inside the day's window, and not crossing anything blocked.
 */
export function validateRange(
  rail: DayRail,
  startMinutes: number,
  endMinutes: number,
  bounds: DurationBounds = BOOKING_DURATION_BOUNDS,
): { ok: true } | { ok: false; reason: RangeError } {
  const duration = endMinutes - startMinutes;
  if (duration % SLOT_MINUTES !== 0) return { ok: false, reason: "not-increment" };
  if (duration < bounds.min) {
    return { ok: false, reason: "too-short" };
  }
  if (duration > bounds.max) {
    return { ok: false, reason: "too-long" };
  }
  if (startMinutes < rail.startMinutes || endMinutes > rail.endMinutes) {
    return { ok: false, reason: "outside-window" };
  }

  const crossesBlocked = rail.slots.some(
    (slot) =>
      slot.blocked &&
      slot.startMinutes >= startMinutes &&
      slot.startMinutes < endMinutes,
  );
  if (crossesBlocked) return { ok: false, reason: "crosses-blocked" };

  return { ok: true };
}

/**
 * Whether one fixed-duration start can be offered for a quote reschedule.
 * The start must be in a single provider work period, but the job may finish
 * shortly after that period ends. Busy intervals still block the whole job.
 */
export function fixedDurationStartIsAvailable(input: {
  rail: DayRail;
  periods: readonly ScheduleDay[];
  busy: readonly BusyInterval[];
  startMinutes: number;
  durationMinutes: number;
  availabilityEndOverrunMinutes?: number;
}) {
  const {
    rail,
    periods,
    busy,
    startMinutes,
    durationMinutes,
    availabilityEndOverrunMinutes = 0,
  } = input;
  const endMinutes = startMinutes + durationMinutes;
  const hasWindow = periods.some((period) => {
    const start = clockToMinutes(period.startLocal);
    const end = clockToMinutes(period.endLocal);
    return startMinutes >= start && endMinutes <= end + availabilityEndOverrunMinutes;
  });
  if (!hasWindow) return false;

  const startSlot = rail.slots.find((slot) => slot.startMinutes === startMinutes);
  if (!startSlot || startSlot.blocked) return false;

  const startInstant = localSlotInstant(rail.date, startMinutes);
  const endInstant = localSlotInstant(rail.date, endMinutes);
  if (!startInstant || !endInstant) return false;
  return !overlapsBusy(
    toEpochRanges(busy),
    startInstant.getTime(),
    endInstant.getTime(),
  );
}

/** How far a selection starting at `startMinutes` may run before it hits something blocked. */
export function maxEndMinutes(
  rail: DayRail,
  startMinutes: number,
  bounds: DurationBounds = BOOKING_DURATION_BOUNDS,
) {
  let end = startMinutes;
  for (const slot of rail.slots) {
    if (slot.startMinutes < startMinutes) continue;
    if (slot.startMinutes !== end) break;
    if (slot.blocked) break;
    end += SLOT_MINUTES;
    if (end - startMinutes >= bounds.max) break;
  }
  return end;
}

/**
 * The first run in the day long enough to hold `minutes`, or null. Used to
 * preselect a sensible range when a customer arrives via "Book again".
 */
export function firstRunFitting(rail: DayRail, minutes: number) {
  let runStart: number | null = null;
  for (const slot of rail.slots) {
    if (slot.blocked) {
      runStart = null;
      continue;
    }
    if (runStart === null) runStart = slot.startMinutes;
    if (slot.startMinutes + SLOT_MINUTES - runStart >= minutes) {
      return { startMinutes: runStart, endMinutes: runStart + minutes };
    }
  }
  return null;
}

/**
 * The exact pair the existing server actions already parse. Keeping the form
 * contract identical means no action or RPC signature has to change.
 */
export function toFormValues(
  date: string,
  startMinutes: number,
  endMinutes: number,
) {
  return {
    scheduledLocal: `${date}T${minutesToClock(startMinutes)}`,
    estimatedMinutes: endMinutes - startMinutes,
  };
}

export function formatRangeSummary(startMinutes: number, endMinutes: number) {
  return `${formatSlotLabel(startMinutes)} - ${formatSlotLabel(endMinutes)} · ${formatDurationLabel(
    endMinutes - startMinutes,
  )}`;
}

/** `07/28/2026`, for the notice shown when an unbookable day is clicked. */
export function formatUsDate(date: string) {
  const [year, month, day] = date.split("-");
  return `${month}/${day}/${year}`;
}
