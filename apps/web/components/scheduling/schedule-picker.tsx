"use client";

import { useMemo, useState } from "react";

import {
  buildDayRail,
  buildMonthCells,
  firstRunFitting,
  groupScheduleDays,
  formatUsDate,
  pilotDateKey,
  toFormValues,
  type BusyInterval,
  type MonthCell,
  type ScheduleDay,
} from "@/lib/booking/availability-grid";
import { cn } from "@/lib/utils";

import { DayRail, type RailOverlay, type TimeRange } from "./day-rail";
import { MonthGrid } from "./month-grid";

const DAY_HEADING = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

/** Format a `YYYY-MM-DD` key without letting the host timezone shift it. */
function headingFor(date: string) {
  return DAY_HEADING.format(new Date(`${date}T12:00:00.000Z`));
}

function monthOf(date: string) {
  const [year, month] = date.split("-").map(Number);
  return new Date(year, month - 1, 1);
}

/** Why a day can't be picked, in the customer's words. */
function unavailableReason(cell: MonthCell) {
  if (cell.state === "past") {
    return "Too soon to book. Pick a date at least 12 hours out.";
  }
  if (cell.state === "full") {
    return `Fully booked on ${formatUsDate(cell.date)}.`;
  }
  return `No availability on ${formatUsDate(cell.date)}.`;
}

export type SchedulePickerProps = {
  /** Open days from `provider_schedule_days`, already override-resolved. */
  days: readonly ScheduleDay[];
  /** Reserved ranges from `provider_busy_intervals`. */
  busy: readonly BusyInterval[];
  /** Server-rendered instant. Passed in so the first paint can't mismatch. */
  nowIso: string;
  minimumNoticeHours: number;
  /** Inclusive `YYYY-MM-DD` bounds of the prefetched horizon. */
  horizonStart: string;
  horizonEnd: string;
  onChange?: (
    value: { scheduledLocal: string; estimatedMinutes: number } | null,
  ) => void;
  /** Preselect a range this long when a day is opened ("Book again"). */
  preferredMinutes?: number;
  /** Read-only provider view: no selection, jobs drawn on the rail. */
  readOnly?: boolean;
  overlaysByDate?: Readonly<Record<string, readonly RailOverlay[]>>;
  dottedDates?: ReadonlySet<string>;
  markedDates?: ReadonlySet<string>;
  gridLabel?: string;
  /** Rendered under the rail for the selected day. */
  railFooter?: (date: string) => React.ReactNode;
};

export function SchedulePicker({
  days,
  busy,
  nowIso,
  minimumNoticeHours,
  horizonStart,
  horizonEnd,
  onChange,
  preferredMinutes,
  readOnly = false,
  overlaysByDate,
  dottedDates,
  markedDates,
  gridLabel,
  railFooter,
}: SchedulePickerProps) {
  const now = useMemo(() => new Date(nowIso), [nowIso]);
  const minMonth = useMemo(() => monthOf(horizonStart), [horizonStart]);
  const maxMonth = useMemo(() => monthOf(horizonEnd), [horizonEnd]);

  // Open on the current month, not the first month of the horizon: the
  // provider's view looks back a few weeks, and landing there would be wrong.
  const [monthStart, setMonthStart] = useState(() => monthOf(pilotDateKey(now)));
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selection, setSelection] = useState<TimeRange | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // A date can carry several periods, so this maps to a list, not one window.
  const dayByDate = useMemo(() => groupScheduleDays(days), [days]);

  const cells = useMemo(() => {
    const built = buildMonthCells({
      monthStart,
      now,
      days,
      busy,
      minimumNoticeHours,
    });
    if (!readOnly) return built;
    // The provider is reviewing, not booking. Every day they have hours on is
    // worth opening, including days already past and days with no room left,
    // because that is exactly where their finished and booked jobs are.
    return built.map((cell) =>
      cell && dayByDate.has(cell.date) ? { ...cell, state: "open" as const } : cell,
    );
  }, [busy, dayByDate, days, minimumNoticeHours, monthStart, now, readOnly]);

  const selectedDay = selectedDate ? dayByDate.get(selectedDate) : undefined;
  const rail = useMemo(
    () =>
      selectedDay
        ? buildDayRail({ day: selectedDay, busy, now, minimumNoticeHours })
        : null,
    [busy, minimumNoticeHours, now, selectedDay],
  );

  /** Single place state and the reported form value move together. */
  function applySelection(date: string | null, next: TimeRange | null) {
    setSelection(next);
    if (readOnly) return;
    onChange?.(
      date && next
        ? toFormValues(date, next.startMinutes, next.endMinutes)
        : null,
    );
  }

  function handleSelect(cell: MonthCell) {
    if (cell.state !== "open") {
      setNotice(unavailableReason(cell));
      return;
    }
    setNotice(null);
    setSelectedDate(cell.date);

    const day = readOnly || !preferredMinutes ? undefined : dayByDate.get(cell.date);
    const fitted = day
      ? firstRunFitting(
          buildDayRail({ day, busy, now, minimumNoticeHours }),
          preferredMinutes!,
        )
      : null;
    applySelection(cell.date, fitted);
  }

  const formValues =
    selectedDate && selection
      ? toFormValues(selectedDate, selection.startMinutes, selection.endMinutes)
      : null;

  return (
    <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,17rem)]">
      <div>
        <MonthGrid
          cells={cells}
          monthStart={monthStart}
          selectedDate={selectedDate}
          onSelect={handleSelect}
          onMonthChange={(next) => {
            setMonthStart(next);
            setNotice(null);
          }}
          minMonth={minMonth}
          maxMonth={maxMonth}
          dottedDates={dottedDates}
          markedDates={markedDates}
          label={gridLabel}
        />
        <p
          role="status"
          className={cn(
            "mt-2 min-h-4 text-xs font-medium",
            notice ? "text-red-700" : "text-transparent",
          )}
        >
          {notice ?? "."}
        </p>
      </div>

      <div className="flex min-h-0 flex-col md:border-l md:border-stone md:pl-5">
        {rail && selectedDate ? (
          <>
            <DayRail
              key={selectedDate}
              rail={rail}
              heading={headingFor(selectedDate)}
              selection={selection}
              onSelectionChange={(next) => applySelection(selectedDate, next)}
              readOnly={readOnly}
              overlays={overlaysByDate?.[selectedDate]}
            />
            {railFooter?.(selectedDate)}
          </>
        ) : (
          <div className="flex h-full min-h-48 flex-col items-center justify-center rounded-xl border border-dashed border-stone px-4 text-center">
            <p className="text-sm font-medium text-ink-soft">
              {readOnly ? "Pick a day to see it" : "Pick a day to see open times"}
            </p>
            <p className="mt-1 text-xs text-mist">
              {readOnly
                ? "Your hours and jobs for that day show here."
                : "Green days have time left."}
            </p>
          </div>
        )}
      </div>

      {readOnly ? null : (
        <>
          <input
            type="hidden"
            name="scheduledLocal"
            value={formValues?.scheduledLocal ?? ""}
          />
          <input
            type="hidden"
            name="estimatedMinutes"
            value={formValues?.estimatedMinutes ?? ""}
          />
        </>
      )}
    </div>
  );
}
