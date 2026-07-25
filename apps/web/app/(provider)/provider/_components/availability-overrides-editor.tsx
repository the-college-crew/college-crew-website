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
  groupScheduleDays,
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
  /** Custom hours for the selected date; a date may carry several periods. */
  const [periods, setPeriods] = useState<{ start: string; end: string }[]>([]);

  const overrideByDate = useMemo(() => {
    const map = new Map<string, AvailabilityOverride[]>();
    for (const row of overrides) {
      map.set(row.local_date, [...(map.get(row.local_date) ?? []), row]);
    }
    return map;
  }, [overrides]);
  const dayByDate = useMemo(() => groupScheduleDays(days), [days]);

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
    const usual = dayByDate.get(cell.date) ?? [];
    const usualPeriods = usual.map((period) => ({
      start: period.startLocal.slice(0, 5),
      end: period.endLocal.slice(0, 5),
    }));

    if (!override) {
      setMode("usual");
      // Prefilling with the usual hours means switching to custom starts from
      // what they already work, not from nothing.
      setPeriods(usualPeriods);
      return;
    }
    const open = override.filter((row) => row.is_available);
    setMode(open.length > 0 ? "custom" : "closed");
    setPeriods(
      open.length > 0
        ? open.map((row) => ({
            start: row.start_local!.slice(0, 5),
            end: row.end_local!.slice(0, 5),
          }))
        : usualPeriods,
    );
  }

  const usualForSelected = selectedDate ? dayByDate.get(selectedDate) : undefined;
  const overrideForSelected = selectedDate
    ? overrideByDate.get(selectedDate)
    : undefined;
  const overrideDates = useMemo(
    () => [...overrideByDate.keys()].sort(),
    [overrideByDate],
  );

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="localDate" value={selectedDate ?? ""} />
      <input
        type="hidden"
        name="mode"
        value={mode === "usual" ? "clear" : mode}
      />
      <input
        type="hidden"
        name="periods"
        value={JSON.stringify(
          mode === "custom"
            ? periods.filter((period) => period.start && period.end)
            : [],
        )}
      />

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
          markedDates={new Set(overrideDates)}
          label="Pick a date to change"
        />

        <div className="md:border-l md:border-stone md:pl-5">
          {selectedDate ? (
            <>
              <p className="font-display text-sm font-semibold text-viridian">
                {DAY_HEADING.format(new Date(`${selectedDate}T12:00:00.000Z`))}
              </p>
              <p className="mt-0.5 text-xs text-mist">
                {usualForSelected?.length
                  ? `Usually ${usualForSelected
                      .map(
                        (period) =>
                          `${formatSlotLabel(
                            clockToMinutes(period.startLocal),
                          )} to ${formatSlotLabel(clockToMinutes(period.endLocal))}`,
                      )
                      .join(", ")}`
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
                <div className="mt-3 space-y-3">
                  {(periods.length > 0 ? periods : [{ start: "", end: "" }]).map(
                    (period, index) => (
                      <div key={index}>
                        <WindowRail
                          railKey={`override-${selectedDate}-${index}`}
                          heading={
                            periods.length > 1
                              ? `Stretch ${index + 1}`
                              : "Hours on this date"
                          }
                          start={period.start}
                          end={period.end}
                          onChange={(next) =>
                            setPeriods((current) => {
                              const base =
                                current.length > 0 ? current : [{ start: "", end: "" }];
                              return base.map((existing, i) =>
                                i === index ? next : existing,
                              );
                            })
                          }
                        />
                        {periods.length > 1 ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              setPeriods((current) =>
                                current.filter((_, i) => i !== index),
                              )
                            }
                          >
                            Remove this stretch
                          </Button>
                        ) : null}
                      </div>
                    ),
                  )}
                  {periods.length < 4 ? (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() =>
                        setPeriods((current) => [
                          ...(current.length > 0 ? current : [{ start: "", end: "" }]),
                          { start: "", end: "" },
                        ])
                      }
                    >
                      + Add another stretch this day
                    </Button>
                  ) : null}
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
                  (mode === "custom" &&
                    !periods.some((period) => period.start && period.end)) ||
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
        {overrideDates.length === 0
          ? "No dates set aside yet."
          : `${overrideDates.length} date${
              overrideDates.length === 1 ? "" : "s"
            } set aside: ${overrideDates.map(formatUsDate).join(", ")}`}
      </p>
    </form>
  );
}
