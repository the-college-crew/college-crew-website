"use client";

import { useMemo } from "react";

import { StatusPill } from "@/components/status-pill";
import {
  clockToMinutes,
  groupScheduleDays,
  minutesToClock,
  pilotDatePosition,
  type BusyInterval,
  type ScheduleDay,
} from "@/lib/booking/availability-grid";
import type { BookingStatus } from "@/lib/db/types";
import { formatTime } from "@/lib/utils";

import type { RailOverlay } from "./day-rail";
import { SchedulePicker } from "./schedule-picker";

export type ProviderCalendarBooking = {
  id: string;
  scheduled_at: string;
  estimated_minutes: number | null;
  status: BookingStatus;
  serviceName: string;
  address: string;
  customerName: string;
};

export type ProviderScheduleCalendarProps = {
  bookings: readonly ProviderCalendarBooking[];
  days: readonly ScheduleDay[];
  busy: readonly BusyInterval[];
  nowIso: string;
  horizonStart: string;
  horizonEnd: string;
  minimumNoticeHours: number;
  /** Dates the provider has given custom hours or closed outright. */
  overrideDates?: readonly string[];
};

/**
 * The provider's own read-only view of the same calendar customers book
 * against: their hours on the left, and the selected day's rail with each job
 * drawn where it actually sits.
 */
export function ProviderScheduleCalendar({
  bookings,
  days,
  busy,
  nowIso,
  horizonStart,
  horizonEnd,
  minimumNoticeHours,
  overrideDates,
}: ProviderScheduleCalendarProps) {
  const { overlaysByDate, dottedDates, resolvedDays, byDay } = useMemo(() => {
    const overlays: Record<string, RailOverlay[]> = {};
    const dotted = new Set<string>();
    // A job can outlive the hours it was booked under, if the provider narrowed
    // their availability afterwards. Widen that day's window to cover it rather
    // than leaving them with a job they can see on the grid but not open.
    const spans = new Map<string, { start: number; end: number }>();

    for (const booking of bookings) {
      const { date, minutes } = pilotDatePosition(booking.scheduled_at);
      dotted.add(date);
      (overlays[date] ??= []).push({
        key: booking.id,
        startMinutes: minutes,
        title: booking.serviceName,
      });

      const end = minutes + (booking.estimated_minutes ?? 60);
      const span = spans.get(date);
      spans.set(date, {
        start: Math.min(span?.start ?? minutes, minutes),
        end: Math.max(span?.end ?? end, end),
      });
    }

    for (const list of Object.values(overlays)) {
      list.sort((a, b) => a.startMinutes - b.startMinutes);
    }

    // Add a period covering any job that falls outside the day's saved periods,
    // rather than leaving the provider a dot on the grid they cannot open.
    const byDate = groupScheduleDays(days);
    for (const [date, span] of spans) {
      const periods = byDate.get(date) ?? [];
      const covered = periods.some(
        (period) =>
          span.start >= clockToMinutes(period.startLocal) &&
          span.end <= clockToMinutes(period.endLocal),
      );
      if (covered) continue;
      byDate.set(date, [
        ...periods,
        {
          date,
          startLocal: minutesToClock(span.start),
          endLocal: minutesToClock(Math.min(span.end, 24 * 60)),
        },
      ]);
    }

    return {
      overlaysByDate: overlays,
      dottedDates: dotted,
      byDay: Object.groupBy(bookings, (booking) =>
        pilotDatePosition(booking.scheduled_at).date,
      ),
      resolvedDays: [...byDate.values()]
        .flat()
        .sort((a, b) => a.date.localeCompare(b.date)),
    };
  }, [bookings, days]);

  return (
    <SchedulePicker
      readOnly
      days={resolvedDays}
      busy={busy}
      nowIso={nowIso}
      minimumNoticeHours={minimumNoticeHours}
      horizonStart={horizonStart}
      horizonEnd={horizonEnd}
      overlaysByDate={overlaysByDate}
      dottedDates={dottedDates}
      markedDates={overrideDates ? new Set(overrideDates) : undefined}
      gridLabel="Your month"
      railFooter={(date) => {
        const jobs = byDay[date] ?? [];
        if (jobs.length === 0) {
          return <p className="mt-2 text-xs text-mist">No jobs this day.</p>;
        }
        return (
          <ul className="mt-2 space-y-2">
            {jobs.map((job) => (
              <li
                key={job.id}
                className="rounded-lg border border-stone bg-shell px-3 py-2 text-xs"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-viridian">
                    {formatTime(job.scheduled_at)} · {job.serviceName}
                  </span>
                  <StatusPill status={job.status} />
                </div>
                <p className="mt-1 text-ink-soft">
                  {job.customerName} · {job.address}
                </p>
              </li>
            ))}
          </ul>
        );
      }}
    />
  );
}
