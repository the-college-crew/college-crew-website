"use client";

import { useMemo } from "react";

import {
  WINDOW_DURATION_BOUNDS,
  buildDayRail,
  clockToMinutes,
  formatSlotLabel,
  minutesToClock,
} from "@/lib/booking/availability-grid";

import { DayRail, type TimeRange } from "./day-rail";

/**
 * The authoring range. Nobody in the pilot is booking a student at 4am, and
 * trimming the dead hours is what keeps the rail short enough to drag in.
 */
export const WINDOW_RAIL_START = "06:00";
export const WINDOW_RAIL_END = "23:00";

/**
 * Availability is recurring, so the rail has no real date. It still needs one:
 * the slot builder resolves each row to an instant to catch DST holes. A plain
 * midsummer day has no transition, so every row resolves and stays pickable.
 */
const WINDOW_RAIL_DATE = "2026-06-15";

export type WindowRailProps = {
  /** `HH:MM` values, or empty strings when nothing is set yet. */
  start: string;
  end: string;
  onChange: (next: { start: string; end: string }) => void;
  heading: string;
  /** Remounts the rail when the caller switches which window is being edited. */
  railKey: string;
};

/**
 * Pick a start and end by dragging, for defining availability rather than
 * booking against it. Same rail, no busy slots, no one-hour minimum, and a
 * tighter row height so a whole working day fits without a long scroll.
 */
export function WindowRail({
  start,
  end,
  onChange,
  heading,
  railKey,
}: WindowRailProps) {
  const rail = useMemo(
    () =>
      buildDayRail({
        day: {
          date: WINDOW_RAIL_DATE,
          startLocal: WINDOW_RAIL_START,
          endLocal: WINDOW_RAIL_END,
        },
        busy: [],
        // No jobs and no notice cutoff: every row has to stay pickable.
        now: new Date(0),
        minimumNoticeHours: 0,
      }),
    [],
  );

  const selection: TimeRange | null =
    start && end
      ? { startMinutes: clockToMinutes(start), endMinutes: clockToMinutes(end) }
      : null;

  return (
    <div>
      <DayRail
        key={railKey}
        rail={rail}
        heading={heading}
        selection={selection}
        onSelectionChange={(next) =>
          onChange(
            next
              ? {
                  start: minutesToClock(next.startMinutes),
                  end: minutesToClock(next.endMinutes),
                }
              : { start: "", end: "" },
          )
        }
        bounds={WINDOW_DURATION_BOUNDS}
        density="compact"
        hideSummary
        emptyHint="Tap when you start, then when you finish."
      />
      <p className="mt-2 text-xs" aria-live="polite">
        {selection ? (
          <span className="font-semibold text-viridian">
            {formatSlotLabel(selection.startMinutes)} to{" "}
            {formatSlotLabel(selection.endMinutes)} Central
          </span>
        ) : (
          <span className="text-mist">No hours set for these days yet.</span>
        )}
      </p>
    </div>
  );
}
