"use client";

import { useTransition } from "react";

import { Button } from "@/components/ui/button";

import { dismissCustomerCancellationNotice } from "../actions";

/** A resolved notice disappears on the refreshed Jobs page; the booking remains. */
export function DismissCustomerCancellationNotice({
  bookingId,
}: {
  bookingId: string;
}) {
  const [pending, startTransition] = useTransition();

  function dismiss() {
    startTransition(async () => {
      const formData = new FormData();
      formData.set("bookingId", bookingId);
      await dismissCustomerCancellationNotice(formData);
    });
  }

  return (
    <Button type="button" variant="ghost" size="sm" onClick={dismiss} disabled={pending}>
      {pending ? "Dismissing…" : "Dismiss"}
    </Button>
  );
}
