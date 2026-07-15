"use client";

import { useActionState, useEffect, useRef, useState } from "react";

import {
  setBookingFromHome,
  setBookingFromOther,
  type BookingFromState,
} from "@/app/actions/booking-from";
import { AddressFields } from "@/components/auth/address-fields";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field";
import type { BookingFromSummary } from "@/lib/location/booking-from";
import { cn } from "@/lib/utils";

/**
 * "Booking from" — compact origin selector shown at the top of Browse and the
 * booking form. Changing it rewrites the cc-booking-from cookie server-side
 * (geocoding included) and the page's server components re-render with fresh
 * distances.
 */
export function BookingFrom({ summary }: { summary: BookingFromSummary }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [state, formAction, pending] = useActionState<
    BookingFromState,
    FormData
  >(setBookingFromOther, {});

  // Close after a successful save — adjust-state-during-render pattern, so no
  // effect-driven cascading re-render.
  const [seenSavedAt, setSeenSavedAt] = useState(state.savedAt);
  if (state.savedAt !== seenSavedAt) {
    setSeenSavedAt(state.savedAt);
    if (state.savedAt) setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const chipLabel =
    summary.kind === "other"
      ? `Other · ${summary.town}`
      : summary.home
        ? `Home · ${summary.home.town}`
        : "Set location";

  return (
    <div ref={containerRef} className="relative inline-block">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-ink">Booking from</span>
        <button
          type="button"
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => setOpen((current) => !current)}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border border-viridian/35 bg-paper px-3 py-1.5 text-xs font-semibold text-viridian transition-colors hover:bg-stone/45",
            open && "bg-stone/45",
          )}
        >
          {chipLabel}
          <span aria-hidden className="text-[10px] text-viridian/70">
            ▾
          </span>
        </button>
      </div>

      {open ? (
        <div
          role="dialog"
          aria-label="Choose where you're booking from"
          className="absolute left-0 top-full z-30 mt-2 w-[min(24rem,calc(100vw-2rem))] rounded-2xl border border-line bg-paper p-4 shadow-lg shadow-viridian/10"
        >
          {summary.home ? (
            <form action={setBookingFromHome} onSubmit={() => setOpen(false)}>
              <button
                type="submit"
                className={cn(
                  "w-full rounded-xl border px-3 py-2.5 text-left transition-colors",
                  summary.kind === "home"
                    ? "border-viridian/50 bg-court"
                    : "border-line hover:bg-court",
                )}
              >
                <span className="block text-sm font-semibold text-ink">
                  My home address
                  {summary.kind === "home" ? (
                    <span className="ml-2 text-xs font-medium text-viridian">
                      Current
                    </span>
                  ) : null}
                </span>
                <span className="mt-0.5 block text-xs text-mist">
                  {summary.home.addressLine}
                </span>
              </button>
            </form>
          ) : (
            <p className="rounded-xl border border-line bg-court px-3 py-2.5 text-xs text-mist">
              Log in and save a home address to book from it in one tap.
            </p>
          )}

          <form action={formAction} className="mt-4 space-y-4">
            <AddressFields
              legend="Somewhere else"
              defaults={
                summary.other
                  ? {
                      address_line1: summary.other.line1,
                      address_line2: summary.other.line2,
                      city: summary.other.city,
                      state: summary.other.state,
                      postal_code: summary.other.zip,
                    }
                  : undefined
              }
            />
            <FieldError>{state.error}</FieldError>
            <Button
              type="submit"
              variant="secondary"
              size="sm"
              className="w-full"
              disabled={pending}
            >
              {pending ? "Checking address…" : "Use this address"}
            </Button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
