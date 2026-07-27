"use client";

import { useActionState } from "react";

import { useBookingCopy } from "@/components/content/booking-copy-provider";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field";

import { openDispute } from "./actions";

export type DisputeCategory =
  | "provider_no_show"
  | "hours"
  | "service"
  | "payment"
  | "cancellation"
  | "other";

export function DisputeForm({
  bookingId,
  categories,
  defaultCategory,
}: {
  bookingId: string;
  categories: DisputeCategory[];
  defaultCategory?: DisputeCategory;
}) {
  const copy = useBookingCopy();
  const categoryLabels: Record<DisputeCategory, string> = {
    provider_no_show: copy("booking-customer.dispute.no-show-option"),
    hours: copy("booking-customer.dispute.hours-option"),
    service: copy("booking-customer.dispute.service-option"),
    payment: copy("booking-customer.dispute.payment-option"),
    cancellation: copy("booking-customer.dispute.cancellation-option"),
    other: copy("booking-customer.dispute.other-option"),
  };
  const [state, formAction, pending] = useActionState(openDispute, {});
  const initial =
    defaultCategory && categories.includes(defaultCategory)
      ? defaultCategory
      : categories[0];

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="bookingId" value={bookingId} />

      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold">
          {copy("booking-customer.dispute.issue-label")}
        </legend>
        {categories.map((category) => (
          <label
            key={category}
            className="flex items-start gap-2 rounded-lg border border-line p-3 text-sm has-[:checked]:border-crew-400 has-[:checked]:bg-crew-50"
          >
            <input
              type="radio"
              name="category"
              value={category}
              defaultChecked={category === initial}
              className="mt-0.5"
            />
            <span>{categoryLabels[category]}</span>
          </label>
        ))}
      </fieldset>

      <div className="space-y-1">
        <label htmlFor="narrative" className="text-sm font-semibold">
          Tell us what happened
        </label>
        <textarea
          id="narrative"
          name="narrative"
          required
          minLength={10}
          maxLength={5000}
          rows={5}
          className="w-full rounded-lg border border-line bg-white p-3 text-sm"
          placeholder={copy("booking-customer.dispute.placeholder")}
        />
        <p className="text-xs text-mist">
          You can’t change the provider’s hours or trigger a refund here. A
          founder reviews your report and decides the outcome.
        </p>
      </div>

      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? "Submitting…" : copy("booking-customer.dispute.submit")}
      </Button>
      <FieldError>{state.error}</FieldError>
    </form>
  );
}
