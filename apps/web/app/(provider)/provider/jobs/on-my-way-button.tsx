"use client";

import { useBookingCopy } from "@/components/content/booking-copy-provider";
import { Button } from "@/components/ui/button";

import { markEnRoute } from "../actions";

export function OnMyWayButton({ bookingId }: { bookingId: string }) {
  const copy = useBookingCopy();
  return (
    <form
      action={markEnRoute}
      onSubmit={(event) => {
        if (
          !window.confirm(copy("booking-provider.jobs.on-way-confirm"))
        ) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="bookingId" value={bookingId} />
      <Button type="submit" variant="secondary" size="sm">
        On my way
      </Button>
    </form>
  );
}
