"use client";

import { useMemo, useState } from "react";

import { StatusPill } from "@/components/status-pill";
import type { BookingStatus } from "@/lib/db/types";
import { cn, formatTime } from "@/lib/utils";

export type CalendarBooking = {
  id: string;
  scheduled_at: string;
  status: BookingStatus;
  serviceName: string;
  address: string;
  customerName: string;
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function dayKey(date: Date) {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

/**
 * Provider dashboard month calendar (SPEC §8): booking days highlighted;
 * tap a day to see job, time, and location.
 */
export function MonthCalendar({ bookings }: { bookings: CalendarBooking[] }) {
  const today = new Date();
  const [monthStart, setMonthStart] = useState(
    () => new Date(today.getFullYear(), today.getMonth(), 1),
  );
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const bookingsByDay = useMemo(() => {
    const map = new Map<string, CalendarBooking[]>();
    for (const booking of bookings) {
      const key = dayKey(new Date(booking.scheduled_at));
      map.set(key, [...(map.get(key) ?? []), booking]);
    }
    return map;
  }, [bookings]);

  const cells = useMemo(() => {
    const year = monthStart.getFullYear();
    const month = monthStart.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const leadingBlanks = new Date(year, month, 1).getDay();

    const result: Array<Date | null> = Array.from(
      { length: leadingBlanks },
      () => null,
    );
    for (let day = 1; day <= daysInMonth; day++) {
      result.push(new Date(year, month, day));
    }
    return result;
  }, [monthStart]);

  const selectedBookings = selectedKey
    ? (bookingsByDay.get(selectedKey) ?? [])
    : [];

  const monthLabel = monthStart.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  return (
    <div>
      <div className="flex items-center justify-between">
        <h3 className="font-display text-lg font-semibold">
          {monthLabel}
        </h3>
        <div className="flex gap-1">
          <button
            type="button"
            aria-label="Previous month"
            className="rounded-lg border border-line bg-paper px-2.5 py-1 text-sm hover:bg-crew-50"
            onClick={() =>
              setMonthStart(
                (m) => new Date(m.getFullYear(), m.getMonth() - 1, 1),
              )
            }
          >
            ←
          </button>
          <button
            type="button"
            aria-label="Next month"
            className="rounded-lg border border-line bg-paper px-2.5 py-1 text-sm hover:bg-crew-50"
            onClick={() =>
              setMonthStart(
                (m) => new Date(m.getFullYear(), m.getMonth() + 1, 1),
              )
            }
          >
            →
          </button>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-7 gap-1 text-center text-xs font-semibold text-mist">
        {WEEKDAYS.map((day) => (
          <div key={day} className="py-1">
            {day}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {cells.map((date, i) => {
          if (!date) return <div key={`blank-${i}`} />;

          const key = dayKey(date);
          const dayBookings = bookingsByDay.get(key) ?? [];
          const isToday = dayKey(today) === key;
          const isSelected = selectedKey === key;

          return (
            <button
              key={key}
              type="button"
              onClick={() => setSelectedKey(isSelected ? null : key)}
              className={cn(
                "flex aspect-square flex-col items-center justify-center rounded-lg border text-sm",
                isSelected
                  ? "border-crew-600 bg-crew-600 text-white"
                  : dayBookings.length > 0
                    ? "border-crew-200 bg-crew-100 font-semibold text-crew-800 hover:border-crew-400"
                    : "border-transparent text-ink-soft hover:bg-court",
                isToday && !isSelected && "border-crew-400",
              )}
            >
              {date.getDate()}
              {dayBookings.length > 0 ? (
                <span
                  aria-label={`${dayBookings.length} booking(s)`}
                  className={cn(
                    "mt-0.5 h-1.5 w-1.5 rounded-full",
                    isSelected ? "bg-white" : "bg-quad-500",
                  )}
                />
              ) : null}
            </button>
          );
        })}
      </div>

      {selectedKey ? (
        <div className="mt-4 space-y-2 border-t border-line pt-4">
          {selectedBookings.length === 0 ? (
            <p className="text-sm text-mist">No jobs on this day.</p>
          ) : (
            selectedBookings.map((booking) => (
              <div
                key={booking.id}
                className="rounded-lg border border-line bg-court px-3 py-2 text-sm"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold">
                    {formatTime(booking.scheduled_at)} — {booking.serviceName}
                  </span>
                  <StatusPill status={booking.status} />
                </div>
                <p className="mt-1 text-xs text-ink-soft">
                  {booking.customerName} · {booking.address}
                </p>
              </div>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
