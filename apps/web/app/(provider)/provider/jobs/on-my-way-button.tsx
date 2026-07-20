"use client";

import { Button } from "@/components/ui/button";

import { markEnRoute } from "../actions";

export function OnMyWayButton({ bookingId }: { bookingId: string }) {
  return (
    <form
      action={markEnRoute}
      onSubmit={(event) => {
        if (!window.confirm("Notify the customer that you are on the way?")) {
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
