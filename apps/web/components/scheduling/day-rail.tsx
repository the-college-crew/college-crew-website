"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  SLOT_MINUTES,
  formatRangeSummary,
  formatSlotLabel,
  maxEndMinutes,
  validateRange,
  type DayRail as DayRailModel,
} from "@/lib/booking/availability-grid";
import { CUSTOMER_ESTIMATE_MINUTES } from "@/lib/booking/policy";
import { cn } from "@/lib/utils";

export type TimeRange = { startMinutes: number; endMinutes: number };

/** A job drawn over the rail on the provider's own calendar. */
export type RailOverlay = {
  key: string;
  startMinutes: number;
  title: string;
  subtitle?: string;
  badge?: React.ReactNode;
};

export type DayRailProps = {
  rail: DayRailModel;
  /** Heading above the rail, e.g. "Fri, Jul 31". */
  heading: string;
  selection: TimeRange | null;
  onSelectionChange?: (next: TimeRange | null) => void;
  /** Provider dashboard mode: show the day, take no input. */
  readOnly?: boolean;
  overlays?: readonly RailOverlay[];
  /** Copy for the blocked-slot tooltip; "booked" on the customer side. */
  busyLabel?: string;
};

const BLOCKED_COPY: Record<string, string> = {
  busy: "Booked",
  notice: "Too soon",
  dst: "Clock change",
};

function normalize(anchorMinutes: number, targetMinutes: number) {
  return anchorMinutes <= targetMinutes
    ? { startMinutes: anchorMinutes, endMinutes: targetMinutes + SLOT_MINUTES }
    : { startMinutes: targetMinutes, endMinutes: anchorMinutes + SLOT_MINUTES };
}

/**
 * Mount this with `key={date}` so a day change starts a fresh gesture. A stale
 * anchor would otherwise let a start picked on one day pair with an end picked
 * on another.
 */
export function DayRail({
  rail,
  heading,
  selection,
  onSelectionChange,
  readOnly = false,
  overlays,
  busyLabel = "Booked",
}: DayRailProps) {
  const [pendingStart, setPendingStart] = useState<number | null>(null);
  const [preview, setPreview] = useState<TimeRange | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const dragAnchor = useRef<number | null>(null);
  const didDrag = useRef(false);

  /** Grow or shrink a raw gesture into something the server would accept. */
  const clampRange = useCallback(
    (anchorMinutes: number, targetMinutes: number): TimeRange | null => {
      const raw = normalize(anchorMinutes, targetMinutes);
      const reachableEnd = maxEndMinutes(rail, raw.startMinutes);
      if (reachableEnd <= raw.startMinutes) return null;

      const endMinutes = Math.max(
        Math.min(raw.endMinutes, reachableEnd),
        Math.min(raw.startMinutes + CUSTOMER_ESTIMATE_MINUTES.min, reachableEnd),
      );
      return { startMinutes: raw.startMinutes, endMinutes };
    },
    [rail],
  );

  const commit = useCallback(
    (range: TimeRange | null) => {
      if (!range) {
        setHint("That time isn't open. Pick another.");
        return;
      }
      const check = validateRange(rail, range.startMinutes, range.endMinutes);
      if (!check.ok) {
        setHint(
          check.reason === "too-short"
            ? "Jobs run at least one hour. There isn't a full hour free from there."
            : check.reason === "too-long"
              ? "Jobs run at most 12 hours. Shorten the range."
              : "That range runs into a time your student isn't free.",
        );
        return;
      }
      setHint(null);
      onSelectionChange?.(range);
    },
    [onSelectionChange, rail],
  );

  useEffect(() => {
    if (readOnly) return;
    function endDrag() {
      if (dragAnchor.current === null) return;
      if (didDrag.current && preview) commit(preview);
      dragAnchor.current = null;
      setPreview(null);
    }
    window.addEventListener("pointerup", endDrag);
    window.addEventListener("pointercancel", endDrag);
    return () => {
      window.removeEventListener("pointerup", endDrag);
      window.removeEventListener("pointercancel", endDrag);
    };
  }, [commit, preview, readOnly]);

  function handleSlotClick(startMinutes: number, blocked: boolean) {
    // A drag already committed on pointerup; the trailing click is noise.
    if (didDrag.current) {
      didDrag.current = false;
      return;
    }
    if (blocked) {
      setPendingStart(null);
      setHint("Your student isn't free then.");
      return;
    }
    if (pendingStart === null) {
      setPendingStart(startMinutes);
      setHint(null);
      onSelectionChange?.(null);
      return;
    }
    commit(clampRange(pendingStart, startMinutes));
    setPendingStart(null);
  }

  const active = preview ?? selection;
  const overlayByStart = new Map(
    (overlays ?? []).map((overlay) => [overlay.startMinutes, overlay]),
  );

  return (
    <div className="flex h-full flex-col">
      <p className="font-display text-sm font-semibold text-viridian">{heading}</p>
      <p className="mt-0.5 text-xs text-mist">
        {formatSlotLabel(rail.startMinutes)} to {formatSlotLabel(rail.endMinutes)}{" "}
        Central
      </p>

      <div
        role="group"
        aria-label={`Times on ${heading}`}
        className="mt-2 max-h-96 flex-1 overflow-y-auto rounded-xl border border-stone bg-paper"
      >
        <div className="grid grid-cols-[3.25rem_1fr]">
          {rail.slots.map((slot) => {
            const onTheHour = slot.startMinutes % 60 === 0;
            const isFirst = slot.startMinutes === rail.startMinutes;
            const selected =
              active !== null &&
              slot.startMinutes >= active.startMinutes &&
              slot.startMinutes < active.endMinutes;
            const isPending = pendingStart === slot.startMinutes;
            const overlay = overlayByStart.get(slot.startMinutes);

            return (
              <div key={slot.startMinutes} className="contents">
                <div
                  className={cn(
                    "flex items-start justify-end pr-2 text-[11px] leading-none text-mist",
                    onTheHour || isFirst ? "pt-px" : "",
                  )}
                >
                  {onTheHour || isFirst ? formatSlotLabel(slot.startMinutes) : null}
                </div>
                <button
                  type="button"
                  disabled={readOnly}
                  aria-disabled={slot.blocked ? true : undefined}
                  aria-pressed={selected || undefined}
                  aria-label={`${slot.label}${
                    slot.blocked
                      ? `, ${BLOCKED_COPY[slot.reason ?? "busy"] ?? busyLabel}`
                      : ""
                  }`}
                  title={
                    slot.blocked
                      ? (BLOCKED_COPY[slot.reason ?? "busy"] ?? busyLabel)
                      : undefined
                  }
                  onPointerDown={() => {
                    if (readOnly || slot.blocked) return;
                    didDrag.current = false;
                    dragAnchor.current = slot.startMinutes;
                  }}
                  onPointerEnter={() => {
                    if (readOnly || dragAnchor.current === null) return;
                    didDrag.current = true;
                    setPreview(clampRange(dragAnchor.current, slot.startMinutes));
                  }}
                  onClick={() => handleSlotClick(slot.startMinutes, slot.blocked)}
                  className={cn(
                    "relative flex h-5 select-none items-center px-2 text-left text-[11px] leading-none transition-colors",
                    "border-t focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-viridian",
                    onTheHour || isFirst ? "border-t-stone" : "border-t-stone/35",
                    slot.blocked
                      ? "cursor-not-allowed bg-stone/45 text-mist"
                      : selected
                        ? "bg-viridian text-shell"
                        : isPending
                          ? "bg-sky text-viridian"
                          : "bg-paper text-viridian hover:bg-honeydew/60",
                    readOnly && "cursor-default",
                  )}
                >
                  {overlay ? (
                    <span className="flex w-full items-center gap-2 truncate font-semibold">
                      <span className="truncate">{overlay.title}</span>
                      {overlay.subtitle ? (
                        <span className="truncate font-normal text-ink-soft">
                          {overlay.subtitle}
                        </span>
                      ) : null}
                      {overlay.badge}
                    </span>
                  ) : slot.blocked && slot.reason === "busy" ? (
                    <span className="sr-only">{busyLabel}</span>
                  ) : null}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {readOnly ? null : (
        <div className="mt-2 min-h-9 text-xs" aria-live="polite">
          {hint ? (
            <p className="font-medium text-red-700">{hint}</p>
          ) : selection ? (
            <p className="font-semibold text-viridian">
              {formatRangeSummary(selection.startMinutes, selection.endMinutes)}
            </p>
          ) : pendingStart !== null ? (
            <p className="text-ink-soft">
              Starting {formatSlotLabel(pendingStart)}. Now pick when it ends.
            </p>
          ) : (
            <p className="text-mist">
              Tap a start time, then an end time. Drag to pick both at once.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
