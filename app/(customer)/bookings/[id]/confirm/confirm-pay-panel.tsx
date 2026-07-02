"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field";

import { confirmAndPay, simulatePayment, type ConfirmPayState } from "./actions";

export function ConfirmPayPanel({
  bookingId,
  simulateAllowed,
}: {
  bookingId: string;
  simulateAllowed: boolean;
}) {
  const [state, formAction, pending] = useActionState<
    ConfirmPayState,
    FormData
  >(confirmAndPay, {});

  return (
    <div className="space-y-3">
      <form action={formAction}>
        <input type="hidden" name="bookingId" value={bookingId} />
        <Button type="submit" size="lg" className="w-full" disabled={pending}>
          {pending ? "Preparing payment…" : "Confirm & pay"}
        </Button>
      </form>

      {state.unconfigured ? (
        <div className="rounded-lg border border-gold-400/60 bg-gold-100 p-4 text-sm text-gold-800">
          <p className="font-semibold">Payments aren&apos;t live yet.</p>
          <p className="mt-1">
            The Stripe test account is still being set up — this button will
            run the real (test-mode) payment once it exists.
          </p>
          {simulateAllowed ? (
            <form action={simulatePayment} className="mt-3">
              <input type="hidden" name="bookingId" value={bookingId} />
              <Button type="submit" variant="secondary" size="sm">
                Simulate payment (dev only)
              </Button>
            </form>
          ) : null}
        </div>
      ) : null}

      <FieldError>{state.error}</FieldError>
    </div>
  );
}
