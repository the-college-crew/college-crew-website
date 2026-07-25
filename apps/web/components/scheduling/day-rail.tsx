"use client";

import { useCallback, useRef, useState } from "react";

import {
  SLOT_MINUTES,
  formatHourLabel,
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
  /** Kept short: it has to fit one 15-minute row. */
  title: string;
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

  /** Tap semantics: first tap sets the start, second sets the end. */
  function tapSlot(startMinutes: number, blocked: boolean) {
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

  /**
   * Which slot sits under the pointer. Hit-testing beats per-slot pointerenter
   * handlers here: once the container captures the pointer, enter and leave
   * stop firing on the slots being dragged across, so a captured drag would
   * silently do nothing.
   */
  function slotAt(clientX: number, clientY: number) {
    const element = document
      .elementFromPoint(clientX, clientY)
      ?.closest<HTMLElement>("[data-slot-minutes]");
    if (!element) return null;
    return {
      startMinutes: Number(element.dataset.slotMinutes),
      blocked: element.dataset.slotBlocked === "true",
    };
  }

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (readOnly) return;
    const slot = slotAt(event.clientX, event.clientY);
    if (!slot || slot.blocked) return;
    didDrag.current = false;
    dragAnchor.current = slot.startMinutes;
    // Only a mouse or pen captures the gesture. Capturing a touch would mean
    // owning vertical movement, and vertical movement in a scrollable rail is
    // the user trying to scroll it. Touch gets tap-start-then-tap-end instead,
    // which is the native pattern there anyway.
    if (event.pointerType !== "touch") {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const anchor = dragAnchor.current;
    if (readOnly || anchor === null || event.pointerType === "touch") return;
    const slot = slotAt(event.clientX, event.clientY);
    if (!slot || slot.startMinutes === anchor) return;
    didDrag.current = true;
    setPreview(clampRange(anchor, slot.startMinutes));
  }

  function handlePointerUp(event: React.PointerEvent<HTMLDivElement>) {
    const anchor = dragAnchor.current;
    if (readOnly || anchor === null) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    dragAnchor.current = null;

    if (didDrag.current) {
      commit(preview);
      setPendingStart(null);
    } else {
      // A press that never moved is a tap, wherever the pointer came to rest.
      tapSlot(anchor, false);
    }
    setPreview(null);
  }

  function handlePointerCancel() {
    dragAnchor.current = null;
    didDrag.current = false;
    setPreview(null);
  }

  const active = preview ?? selection;
  const overlayByStart = new Map(
    (overlays ?? []).map((overlay) => [overlay.startMinutes, overlay]),
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
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
        <div
          className="grid grid-cols-[3.5rem_1fr]"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
        >
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
                  {onTheHour || isFirst ? formatHourLabel(slot.startMinutes) : null}
                </div>
                <button
                  type="button"
                  disabled={readOnly}
                  data-slot-minutes={slot.startMinutes}
                  data-slot-blocked={slot.blocked}
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
                  // Pointer gestures are handled on the container; a click with
                  // detail 0 is a keyboard activation, which fires no pointer
                  // events and would otherwise be the one way in that doesn't work.
                  onClick={(event) => {
                    if (readOnly || event.detail !== 0) return;
                    tapSlot(slot.startMinutes, slot.blocked);
                  }}
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
                    // One short line only: the row is a 15-minute slice, so
                    // anything longer clips. The full job detail lives in the
                    // list under the rail.
                    <span className="w-full truncate font-semibold">
                      {overlay.title}
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
