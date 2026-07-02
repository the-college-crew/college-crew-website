"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { FieldError, Input, Select } from "@/components/ui/field";
import type { PriceType, PriceUnit, Service } from "@/lib/db/types";

export type Offering = {
  service_id: string;
  price_cents: number;
  price_type: PriceType;
  unit: PriceUnit;
};

type FormState = { error?: string; success?: string };

/**
 * One row per live service: offer it or not, at what price, per what unit.
 * Used in onboarding (step 3) and in Profile & settings, which is the
 * pricing source of truth after onboarding (SPEC §3).
 */
export function ServicesPricingForm({
  services,
  offerings,
  action,
  submitLabel,
}: {
  services: Service[];
  offerings: Offering[];
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    action,
    {},
  );
  const [checked, setChecked] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(offerings.map((o) => [o.service_id, true])),
  );
  const [quote, setQuote] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(
      offerings.map((o) => [o.service_id, o.price_type === "quote"]),
    ),
  );

  const byServiceId = new Map(offerings.map((o) => [o.service_id, o]));

  return (
    <form action={formAction} className="space-y-4">
      <ul className="space-y-3">
        {services.map((service) => {
          const existing = byServiceId.get(service.id);
          const isChecked = checked[service.id] ?? false;
          const isQuote = quote[service.id] ?? false;

          return (
            <li
              key={service.id}
              className="rounded-lg border border-line bg-paper p-4"
            >
              <label className="flex items-center gap-2 text-sm font-semibold">
                <input
                  type="checkbox"
                  name={`offer_${service.id}`}
                  checked={isChecked}
                  onChange={(event) =>
                    setChecked((prev) => ({
                      ...prev,
                      [service.id]: event.target.checked,
                    }))
                  }
                />
                {service.name}
              </label>

              {isChecked ? (
                <div className="mt-3 grid grid-cols-3 gap-2">
                  <Select
                    name={`type_${service.id}`}
                    defaultValue={existing?.price_type ?? "fixed"}
                    aria-label={`${service.name} pricing type`}
                    onChange={(event) =>
                      setQuote((prev) => ({
                        ...prev,
                        [service.id]: event.target.value === "quote",
                      }))
                    }
                  >
                    <option value="fixed">Fixed price</option>
                    <option value="quote">Request a quote</option>
                  </Select>
                  <Input
                    type="number"
                    name={`price_${service.id}`}
                    aria-label={`${service.name} price in dollars`}
                    placeholder="45"
                    min="1"
                    step="0.01"
                    disabled={isQuote}
                    defaultValue={
                      existing && existing.price_cents > 0
                        ? existing.price_cents / 100
                        : undefined
                    }
                  />
                  <Select
                    name={`unit_${service.id}`}
                    defaultValue={existing?.unit ?? "per_job"}
                    aria-label={`${service.name} price unit`}
                    disabled={isQuote}
                  >
                    <option value="per_job">per job</option>
                    <option value="per_hour">per hour</option>
                  </Select>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>

      <FieldError>{state.error}</FieldError>
      {state.success ? (
        <p className="text-sm font-medium text-quad-700">{state.success}</p>
      ) : null}

      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "Saving…" : submitLabel}
      </Button>
    </form>
  );
}
