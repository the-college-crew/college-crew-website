"use client";

import { useActionState, useMemo, useState } from "react";

import { MonthGrid } from "@/components/scheduling/month-grid";
import { WindowRail } from "@/components/scheduling/window-rail";
import { Button } from "@/components/ui/button";
import { FieldError, FieldHint } from "@/components/ui/field";
import {
  buildMonthCells,
  clockToMinutes,
  formatSlotLabel,
  formatUsDate,
  pilotDateKey,
  shiftDateKey,
  type BusyInterval,
  type MonthCell,
  type ScheduleDay,
} from "@/lib/booking/availability-grid";
import type { ProviderAvailabilityOverrideRow } from "@/lib/db/types";
import { cn } from "@/lib/utils";

import type { AvailabilityOverrideState } from "@/app/(shared)/account/provider-actions";

/** How far ahead a provider can set an exception. Matches the RPC's own limit. */
const OVERRIDE_HORIZON_DAYS = 364;

const DAY_HEADING = new Intl.DateTimeFormat("en-US", {
  weekday: "long",
  month: "long",
  day: "numeric",
  timeZone: "UTC",
});

type Mode = "usual" | "closed" | "custom";

export type AvailabilityOverride = Pick<
  ProviderAvailabilityOverrideRow,
  "local_date" | "is_available" | "start_local" | "end_local"
>;

export function AvailabilityOverridesEditor({
  action,
  nowIso,
  /** Effective open days, overrides already applied, from provider_schedule_days. */
  days,
  overrides,
  /** Reserved ranges, so closing a day with work on it can warn instead of surprise. */
  busy,
}: {
  action: (
    previous: AvailabilityOverrideState,
    formData: FormData,
  ) => Promise<AvailabilityOverrideState>;
  nowIso: string;
  days: readonly ScheduleDay[];
  overrides: readonly AvailabilityOverride[];
  busy: readonly BusyInterval[];
}) {
  const [state, formAction, pending] = useActionState<
    AvailabilityOverrideState,
    FormData
  >(action, {});

  const now = useMemo(() => new Date(nowIso), [nowIso]);
  const today = useMemo(() => pilotDateKey(now), [now]);
  const [monthStart, setMonthStart] = useState(
    () => new Date(now.getFullYear(), now.getMonth(), 1),
  );
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("usual");
  const [window, setWindow] = useState({ start: "", end: "" });

  const overrideByDate = useMemo(
    () => new Map(overrides.map((row) => [row.local_date, row])),
    [overrides],
  );
  const dayByDate = useMemo(
    () => new Map(days.map((day) => [day.date, day])),
    [days],
  );

  const cells = useMemo(() => {
    const built = buildMonthCells({
      monthStart,
      now,
      days,
      busy: [],
      minimumNoticeHours: 0,
      // Any window at all is worth editing, however short.
      minMinutes: 15,
    });
    // Editing is about the day, not about whether a job still fits in it, so a
    // closed day has to stay pickable: closed is exactly what you might want
    // to undo.
    return built.map((cell) =>
      cell && cell.date >= today ? { ...cell, state: "open" as const } : cell,
    );
  }, [days, monthStart, now, today]);

  const busyOnSelected = useMemo(() => {
    if (!selectedDate) return false;
    return busy.some((interval) => pilotDateKey(interval.start) === selectedDate);
  }, [busy, selectedDate]);

  function selectDate(cell: MonthCell) {
    if (cell.date < today) return;
    setSelectedDate(cell.date);

    const override = overrideByDate.get(cell.date);
    const usual = dayByDate.get(cell.date);
    if (!override) {
      setMode("usual");
      setWindow({
        start: usual ? usual.startLocal.slice(0, 5) : "",
        end: usual ? usual.endLocal.slice(0, 5) : "",
      });
      return;
    }
    setMode(override.is_available ? "custom" : "closed");
    setWindow({
      start: override.start_local?.slice(0, 5) ?? usual?.startLocal.slice(0, 5) ?? "",
      end: override.end_local?.slice(0, 5) ?? usual?.endLocal.slice(0, 5) ?? "",
    });
  }

  const usualForSelected = selectedDate ? dayByDate.get(selectedDate) : undefined;
  const overrideForSelected = selectedDate
    ? overrideByDate.get(selectedDate)
    : undefined;

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="localDate" value={selectedDate ?? ""} />
      <input
        type="hidden"
        name="mode"
        value={mode === "usual" ? "clear" : mode}
      />
      <input type="hidden" name="start" value={mode === "custom" ? window.start : ""} />
      <input type="hidden" name="end" value={mode === "custom" ? window.end : ""} />

      <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,17rem)]">
        <MonthGrid
          cells={cells}
          monthStart={monthStart}
          selectedDate={selectedDate}
          onSelect={selectDate}
          onMonthChange={setMonthStart}
          minMonth={new Date(now.getFullYear(), now.getMonth(), 1)}
          maxMonth={(() => {
            const [year, month] = shiftDateKey(today, OVERRIDE_HORIZON_DAYS)
              .split("-")
              .map(Number);
            return new Date(year, month - 1, 1);
          })()}
          markedDates={new Set(overrideByDate.keys())}
          label="Pick a date to change"
        />

        <div className="md:border-l md:border-stone md:pl-5">
          {selectedDate ? (
            <>
              <p className="font-display text-sm font-semibold text-viridian">
                {DAY_HEADING.format(new Date(`${selectedDate}T12:00:00.000Z`))}
              </p>
              <p className="mt-0.5 text-xs text-mist">
                {usualForSelected
                  ? `Usually ${formatSlotLabel(
                      clockToMinutes(usualForSelected.startLocal),
                    )} to ${formatSlotLabel(
                      clockToMinutes(usualForSelected.endLocal),
                    )}`
                  : "You don't usually work this day."}
              </p>

              <div className="mt-3 space-y-2">
                {(
                  [
                    ["usual", "Keep my usual hours"],
                    ["closed", "Not working this day"],
                    ["custom", "Different hours this day"],
                  ] as const
                ).map(([value, label]) => (
                  <label
                    key={value}
                    className={cn(
                      "flex items-center gap-2.5 rounded-lg border px-3 py-2 text-sm",
                      mode === value
                        ? "border-viridian bg-honeydew font-semibold text-viridian"
                        : "border-stone bg-paper text-ink-soft",
                    )}
                  >
                    <input
                      type="radio"
                      name="overrideMode"
                      value={value}
                      checked={mode === value}
                      onChange={() => setMode(value)}
                      className="h-4 w-4 border-line"
                    />
                    {label}
                  </label>
                ))}
              </div>

              {mode === "custom" ? (
                <div className="mt-3">
                  <WindowRail
                    railKey={`override-${selectedDate}`}
                    heading="Hours on this date"
                    start={window.start}
                    end={window.end}
                    onChange={setWindow}
                  />
                </div>
              ) : null}

              {mode === "closed" && busyOnSelected ? (
                <p className="mt-3 rounded-lg border border-gold-400/60 bg-gold-100 p-3 text-xs text-gold-800">
                  You already have work booked this day. Closing the date stops
                  new requests, but it does not cancel that job.
                </p>
              ) : null}

              <Button
                type="submit"
                size="sm"
                className="mt-3 w-full"
                disabled={
                  pending ||
                  (mode === "custom" && (!window.start || !window.end)) ||
                  (mode === "usual" && !overrideForSelected)
                }
              >
                {pending ? "Saving…" : "Save this date"}
              </Button>
            </>
          ) : (
            <div className="flex h-full min-h-48 flex-col items-center justify-center rounded-xl border border-dashed border-stone px-4 text-center">
              <p className="text-sm font-medium text-ink-soft">
                Pick a date to change it
              </p>
              <p className="mt-1 text-xs text-mist">
                Marked dates already differ from your usual week.
              </p>
            </div>
          )}
        </div>
      </div>

      <FieldHint>
        These override your weekly hours for one date. Everything else keeps
        following the week you set above.
      </FieldHint>
      <FieldError>{state.error}</FieldError>
      {state.success ? (
        <p className="text-sm font-medium text-quad-700">{state.success}</p>
      ) : null}
      {selectedDate ? null : (
        <p className="sr-only">Select a date before saving.</p>
      )}
      <p className="text-xs text-mist">
        {overrides.length === 0
          ? "No dates set aside yet."
          : `${overrides.length} date${overrides.length === 1 ? "" : "s"} set aside: ${overrides
              .map((row) => formatUsDate(row.local_date))
              .join(", ")}`}
      </p>
    </form>
  );
}
