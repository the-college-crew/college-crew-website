"use client";

import { useMemo, useState } from "react";

import {
  buildMonthCells,
  pilotDateKey,
  type BusyInterval,
  type MonthCell,
  type ScheduleDay,
} from "@/lib/booking/availability-grid";
import {
  availableQuoteDayparts,
  QUOTE_DAYPART_DESCRIPTIONS,
  QUOTE_DAYPART_LABELS,
  type QuoteDaypart,
} from "@/lib/booking/quote-dayparts";
import { cn } from "@/lib/utils";

import { MonthGrid } from "./month-grid";

export type QuoteDaypartSelection = {
  requestedDate: string | null;
  requestedDaypart: QuoteDaypart | null;
};

function monthOf(date: string) {
  const [year, month] = date.split("-").map(Number);
  return new Date(year, month - 1, 1);
}

export function QuoteDaypartPicker({
  days,
  busy,
  nowIso,
  minimumNoticeHours,
  horizonStart,
  horizonEnd,
  selection,
  onSelectionChange,
  onChange,
}: {
  days: readonly ScheduleDay[];
  busy: readonly BusyInterval[];
  nowIso: string;
  minimumNoticeHours: number;
  horizonStart: string;
  horizonEnd: string;
  selection?: QuoteDaypartSelection;
  onSelectionChange?: (value: QuoteDaypartSelection) => void;
  onChange?: (value: { requestedDate: string; requestedDaypart: QuoteDaypart } | null) => void;
}) {
  const now = useMemo(() => new Date(nowIso), [nowIso]);
  const [monthStart, setMonthStart] = useState(() => monthOf(pilotDateKey(now)));
  const [internalSelection, setInternalSelection] = useState<QuoteDaypartSelection>({
    requestedDate: null,
    requestedDaypart: null,
  });
  const [notice, setNotice] = useState<string | null>(null);
  const selectedDate =
    selection === undefined
      ? internalSelection.requestedDate
      : selection.requestedDate;
  const selectedDaypart =
    selection === undefined
      ? internalSelection.requestedDaypart
      : selection.requestedDaypart;
  const cells = useMemo(
    () =>
      buildMonthCells({
        monthStart,
        now,
        days,
        busy,
        minimumNoticeHours,
        minMinutes: 60,
      }),
    [busy, days, minimumNoticeHours, monthStart, now],
  );
  const available = useMemo(
    () =>
      selectedDate
        ? availableQuoteDayparts({
            date: selectedDate,
            days,
            busy,
            now,
            minimumNoticeHours,
          })
        : [],
    [busy, days, minimumNoticeHours, now, selectedDate],
  );

  function selectDate(cell: MonthCell) {
    if (cell.state !== "open") {
      setNotice("That date does not have an open one-hour quote window.");
      return;
    }
    setNotice(null);
    const next = { requestedDate: cell.date, requestedDaypart: null };
    setInternalSelection(next);
    onSelectionChange?.(next);
    onChange?.(null);
  }

  function selectDaypart(daypart: QuoteDaypart) {
    if (!selectedDate || !available.includes(daypart)) return;
    const next = { requestedDate: selectedDate, requestedDaypart: daypart };
    setInternalSelection(next);
    onSelectionChange?.(next);
    onChange?.({ requestedDate: selectedDate, requestedDaypart: daypart });
  }

  return (
    <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,17rem)]">
      <MonthGrid
        cells={cells}
        monthStart={monthStart}
        selectedDate={selectedDate}
        onSelect={selectDate}
        onMonthChange={(next) => {
          setMonthStart(next);
          setNotice(null);
        }}
        minMonth={monthOf(horizonStart)}
        maxMonth={monthOf(horizonEnd)}
        label="Choose a date for the quote request"
      />
      <div className="md:border-l md:border-stone md:pl-5">
        {selectedDate ? (
          <fieldset>
            <legend className="text-sm font-medium text-ink">
              What part of the day works?
            </legend>
            <div className="mt-2 space-y-2">
              {(["morning", "afternoon", "either"] as const).map((daypart) => {
                const enabled = available.includes(daypart);
                return (
                  <label
                    key={daypart}
                    className={cn(
                      "flex gap-3 rounded-xl border p-3 text-sm",
                      enabled
                        ? "cursor-pointer border-line bg-court text-ink-soft"
                        : "cursor-not-allowed border-line/60 bg-court/40 text-mist",
                    )}
                  >
                    <input
                      type="radio"
                      name="requestedDaypartChoice"
                      checked={selectedDaypart === daypart}
                      disabled={!enabled}
                      onChange={() => selectDaypart(daypart)}
                    />
                    <span>
                      <span className="font-medium text-ink">
                        {QUOTE_DAYPART_LABELS[daypart]}
                      </span>
                      <br />
                      {QUOTE_DAYPART_DESCRIPTIONS[daypart]}
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        ) : (
          <div className="flex min-h-48 items-center justify-center rounded-xl border border-dashed border-stone px-4 text-center text-sm text-ink-soft">
            Pick an open day, then choose Morning, Afternoon, or Either.
          </div>
        )}
      </div>
      <p role="status" className="text-xs font-medium text-red-700">
        {notice}
      </p>
      <input type="hidden" name="requestedDate" value={selectedDate ?? ""} />
      <input type="hidden" name="requestedDaypart" value={selectedDaypart ?? ""} />
    </div>
  );
}
