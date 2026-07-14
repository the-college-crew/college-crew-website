"use client";

import { useActionState } from "react";

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

const CATEGORY_LABELS: Record<DisputeCategory, string> = {
  provider_no_show: "The provider never showed up",
  hours: "The billed time is wrong",
  service: "The work wasn’t done as agreed",
  payment: "A payment or charge problem",
  cancellation: "A cancellation problem",
  other: "Something else",
};

export function DisputeForm({
  bookingId,
  categories,
  defaultCategory,
}: {
  bookingId: string;
  categories: DisputeCategory[];
  defaultCategory?: DisputeCategory;
}) {
  const [state, formAction, pending] = useActionState(openDispute, {});
  const initial =
    defaultCategory && categories.includes(defaultCategory)
      ? defaultCategory
      : categories[0];

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="bookingId" value={bookingId} />

      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold">What’s the issue?</legend>
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
            <span>{CATEGORY_LABELS[category]}</span>
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
          placeholder="Describe the problem in your own words. A founder reviews every dispute personally."
        />
        <p className="text-xs text-mist">
          You can’t change the provider’s hours or trigger a refund here — a
          founder reviews your report and decides the outcome.
        </p>
      </div>

      <Button type="submit" disabled={pending}>
        {pending ? "Submitting…" : "Submit for review"}
      </Button>
      <FieldError>{state.error}</FieldError>
    </form>
  );
}
