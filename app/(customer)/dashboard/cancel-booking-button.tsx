"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field";

import { cancelBooking } from "./actions";

export function CancelBookingButton({ bookingId }: { bookingId: string }) {
  const [state, formAction, pending] = useActionState(cancelBooking, {});
  return (
    <form action={formAction} className="space-y-1">
      <input type="hidden" name="bookingId" value={bookingId} />
      <Button type="submit" variant="danger" size="sm" disabled={pending}>
        {pending ? "Cancelling…" : "Cancel request"}
      </Button>
      <FieldError>{state.error}</FieldError>
    </form>
  );
}
