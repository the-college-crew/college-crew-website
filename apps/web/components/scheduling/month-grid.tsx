"use client";

import { cn } from "@/lib/utils";
import type { DayState, MonthCell } from "@/lib/booking/availability-grid";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const MONTH_LABEL = new Intl.DateTimeFormat("en-US", {
  month: "long",
  year: "numeric",
});

/**
 * Unbookable days keep the page's own text color at a low weight rather than
 * getting their own tone, so the tinted open days are the only thing the eye
 * lands on. Selected wins over everything, including today's ring.
 */
const stateClasses: Record<DayState, string> = {
  open: "border-sage-200 bg-honeydew font-semibold text-viridian hover:border-viridian/40",
  past: "border-transparent text-mist",
  closed: "border-transparent text-mist",
  full: "border-transparent text-mist",
};

export type MonthGridProps = {
  cells: Array<MonthCell | null>;
  monthStart: Date;
  selectedDate: string | null;
  onSelect: (cell: MonthCell) => void;
  onMonthChange: (next: Date) => void;
  /** First and last month the caller has data for; navigation stops there. */
  minMonth: Date;
  maxMonth: Date;
  /** Days carrying a provider-set override, marked so the provider can spot them. */
  markedDates?: ReadonlySet<string>;
  /** Days with at least one job, dotted red on the provider's own calendar. */
  dottedDates?: ReadonlySet<string>;
  label?: string;
  /**
   * The provider reviewing their own month, not a customer booking one. Turned
   * off days and past dates get dimmed instead of blending into the page —
   * they're still clickable, this only changes how they look.
   */
  readOnly?: boolean;
};

function sameMonth(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

function shiftMonth(month: Date, delta: number) {
  return new Date(month.getFullYear(), month.getMonth() + delta, 1);
}

export function MonthGrid({
  cells,
  monthStart,
  selectedDate,
  onSelect,
  onMonthChange,
  minMonth,
  maxMonth,
  markedDates,
  dottedDates,
  label = "Choose a date",
  readOnly = false,
}: MonthGridProps) {
  const atMin = sameMonth(monthStart, minMonth) || monthStart <= minMonth;
  const atMax = sameMonth(monthStart, maxMonth) || monthStart >= maxMonth;

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          aria-label="Previous month"
          disabled={atMin}
          onClick={() => onMonthChange(shiftMonth(monthStart, -1))}
          className="rounded-lg border border-stone bg-paper px-2.5 py-1 text-sm text-viridian transition-colors hover:bg-shell disabled:pointer-events-none disabled:opacity-35"
        >
          &#8249;
        </button>
        <h3
          aria-live="polite"
          className="font-display text-base font-semibold text-viridian"
        >
          {MONTH_LABEL.format(monthStart)}
        </h3>
        <button
          type="button"
          aria-label="Next month"
          disabled={atMax}
          onClick={() => onMonthChange(shiftMonth(monthStart, 1))}
          className="rounded-lg border border-stone bg-paper px-2.5 py-1 text-sm text-viridian transition-colors hover:bg-shell disabled:pointer-events-none disabled:opacity-35"
        >
          &#8250;
        </button>
      </div>

      <div
        role="grid"
        aria-label={label}
        className="mt-3 grid grid-cols-7 gap-1"
      >
        {WEEKDAYS.map((weekday) => (
          <div
            key={weekday}
            role="columnheader"
            className="py-1 text-center text-[11px] font-semibold text-mist"
          >
            {weekday}
          </div>
        ))}

        {cells.map((cell, index) => {
          if (!cell) return <div key={`blank-${index}`} role="presentation" />;

          // Only readOnly (the provider's own view) dims turned-off/past days;
          // the customer booking calendar keeps its original muted-text look.
          const dimmed =
            readOnly && (cell.state === "closed" || cell.state === "past");
          const selectable = readOnly || cell.state === "open";
          const isSelected = selectedDate === cell.date;

          return (
            <button
              key={cell.date}
              type="button"
              // Stable hook for tests: day numbers repeat across months, so
              // there is otherwise nothing unique to select a cell by.
              data-date={cell.date}
              data-day-state={cell.state}
              // Unbookable days stay focusable and clickable on purpose: the
              // click is what surfaces the reason, which a `disabled` button
              // could never do. In the provider's own view every day is
              // clickable regardless of state, since past and closed days can
              // still hold jobs worth reviewing.
              aria-disabled={selectable ? undefined : true}
              aria-pressed={selectable ? isSelected : undefined}
              onClick={() => onSelect(cell)}
              className={cn(
                "relative flex aspect-square flex-col items-center justify-center rounded-lg border text-sm transition-colors",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-viridian",
                isSelected
                  ? "border-viridian bg-viridian font-semibold text-shell"
                  : cell.isToday
                    ? "border-sky bg-sky font-semibold text-viridian"
                    : dimmed
                      ? "border-transparent bg-stone/45 text-mist"
                      : stateClasses[cell.state],
                !selectable && "cursor-not-allowed",
              )}
            >
              {cell.dayOfMonth}
              {markedDates?.has(cell.date) ? (
                <span
                  aria-hidden
                  className={cn(
                    "mt-0.5 h-1.5 w-1.5 rounded-full",
                    isSelected ? "bg-shell" : "bg-viridian",
                  )}
                />
              ) : null}
              {dottedDates?.has(cell.date) ? (
                <span
                  aria-hidden
                  className={cn(
                    "absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full",
                    isSelected ? "bg-shell" : "bg-red-500",
                  )}
                />
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
