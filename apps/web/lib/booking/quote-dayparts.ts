import {
  buildDayRail,
  groupScheduleDays,
  type BusyInterval,
  type ScheduleDay,
} from "./availability-grid";

export const QUOTE_DAYPARTS = ["morning", "afternoon", "either"] as const;
export type QuoteDaypart = (typeof QUOTE_DAYPARTS)[number];

export const QUOTE_DAYPART_LABELS: Record<QuoteDaypart, string> = {
  morning: "Morning",
  afternoon: "Afternoon",
  either: "Either",
};

export const QUOTE_DAYPART_DESCRIPTIONS: Record<QuoteDaypart, string> = {
  morning: "Start between 8:00 AM and noon",
  afternoon: "Start between noon and 5:00 PM",
  either: "Any start between 8:00 AM and 5:00 PM",
};

const ONE_HOUR_SLOTS = 4;

/** Start boundaries only; a job may extend beyond the daypart if availability does. */
export function quoteDaypartContainsStart(
  daypart: QuoteDaypart,
  startMinutes: number,
) {
  if (daypart === "morning") return startMinutes >= 8 * 60 && startMinutes < 12 * 60;
  if (daypart === "afternoon") return startMinutes >= 12 * 60 && startMinutes <= 17 * 60;
  return startMinutes >= 8 * 60 && startMinutes <= 17 * 60;
}

/**
 * Customer-side mirror of the database's minimum quote-request capacity guard:
 * at least one continuous free hour must start inside the selected daypart.
 */
export function availableQuoteDayparts(input: {
  date: string;
  days: readonly ScheduleDay[];
  busy: readonly BusyInterval[];
  now: Date;
  minimumNoticeHours: number;
}): QuoteDaypart[] {
  const periods = groupScheduleDays(input.days).get(input.date);
  if (!periods) return [];
  const rail = buildDayRail({
    day: periods,
    busy: input.busy,
    now: input.now,
    minimumNoticeHours: input.minimumNoticeHours,
  });

  const supports = (daypart: QuoteDaypart) =>
    rail.slots.some((slot, index) => {
      if (!quoteDaypartContainsStart(daypart, slot.startMinutes)) return false;
      const candidates = rail.slots.slice(index, index + ONE_HOUR_SLOTS);
      return (
        candidates.length === ONE_HOUR_SLOTS &&
        candidates.every(
          (candidate, offset) =>
            !candidate.blocked &&
            candidate.startMinutes === slot.startMinutes + offset * 15,
        )
      );
    });

  const result: QuoteDaypart[] = [];
  if (supports("morning")) result.push("morning");
  if (supports("afternoon")) result.push("afternoon");
  if (result.length > 0) result.push("either");
  return result;
}

export function formatQuoteDaypart(daypart: QuoteDaypart) {
  return QUOTE_DAYPART_LABELS[daypart];
}
