"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field";

import { releasePayout } from "./actions";

export function PayoutReleaseButton({ bookingId }: { bookingId: string }) {
  const [state, formAction, pending] = useActionState(releasePayout, {});

  if (state.success) {
    return (
      <p className="mt-3 text-sm font-semibold text-quad-800">{state.success}</p>
    );
  }

  return (
    <form action={formAction} className="mt-3 space-y-2">
      <input type="hidden" name="bookingId" value={bookingId} />
      <Button type="submit" disabled={pending}>
        {pending ? "Releasing…" : "Release payout"}
      </Button>
      <FieldError>{state.error}</FieldError>
    </form>
  );
}
