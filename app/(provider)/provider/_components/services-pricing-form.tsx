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

type FormState = {
  error?: string;
  success?: string;
  fieldErrors?: Record<string, string>;
};

/** One editable row's state — the single source of truth for that service. */
type Row = {
  offered: boolean;
  priceType: PriceType;
  price: string; // dollars, as typed
  unit: PriceUnit;
};

function initialRows(services: Service[], offerings: Offering[]): Record<string, Row> {
  const byServiceId = new Map(offerings.map((o) => [o.service_id, o]));
  return Object.fromEntries(
    services.map((service) => {
      const existing = byServiceId.get(service.id);
      const row: Row = {
        offered: Boolean(existing),
        priceType: existing?.price_type ?? "fixed",
        price:
          existing && existing.price_cents > 0
            ? String(existing.price_cents / 100)
            : "",
        unit: existing?.unit ?? "per_job",
      };
      return [service.id, row];
    }),
  );
}

/**
 * One row per live service: offer it or not, at what price, per what unit.
 * Used in onboarding (step 3) and in Profile & settings, which is the
 * pricing source of truth after onboarding (SPEC §3).
 *
 * Every field is CONTROLLED. React 19 resets *uncontrolled* form fields once a
 * Server Action returns, so mixing `defaultValue` fields with React state (as
 * an earlier version did) wiped the provider's typed prices on a validation
 * error and desynced the quote toggle from the greyed-out price/unit inputs.
 * Keeping all state in `rows` means a failed submit re-renders untouched and
 * `disabled` always matches the visible dropdown.
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
  const [rows, setRows] = useState<Record<string, Row>>(() =>
    initialRows(services, offerings),
  );

  const update = (serviceId: string, patch: Partial<Row>) =>
    setRows((prev) => ({
      ...prev,
      [serviceId]: { ...prev[serviceId], ...patch },
    }));

  return (
    <form action={formAction} className="space-y-4">
      <ul className="space-y-3">
        {services.map((service) => {
          const row = rows[service.id];
          const isQuote = row.priceType === "quote";
          const rowError = row.offered
            ? state.fieldErrors?.[service.id]
            : undefined;
          const errorId = `price-error-${service.id}`;

          return (
            <li
              key={service.id}
              className="rounded-lg border border-line bg-paper p-4"
            >
              <label className="flex items-center gap-2 text-sm font-semibold">
                <input
                  type="checkbox"
                  name={`offer_${service.id}`}
                  checked={row.offered}
                  onChange={(event) =>
                    update(service.id, { offered: event.target.checked })
                  }
                />
                {service.name}
              </label>

              {row.offered ? (
                <>
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    <Select
                      name={`type_${service.id}`}
                      value={row.priceType}
                      aria-label={`${service.name} pricing type`}
                      onChange={(event) =>
                        update(service.id, {
                          priceType:
                            event.target.value === "quote" ? "quote" : "fixed",
                        })
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
                      value={isQuote ? "" : row.price}
                      onChange={(event) =>
                        update(service.id, { price: event.target.value })
                      }
                      aria-invalid={rowError ? true : undefined}
                      aria-describedby={rowError ? errorId : undefined}
                    />
                    <Select
                      name={`unit_${service.id}`}
                      value={row.unit}
                      aria-label={`${service.name} price unit`}
                      disabled={isQuote}
                      onChange={(event) =>
                        update(service.id, {
                          unit:
                            event.target.value === "per_hour"
                              ? "per_hour"
                              : "per_job",
                        })
                      }
                    >
                      <option value="per_job">per job</option>
                      <option value="per_hour">per hour</option>
                    </Select>
                  </div>
                  {rowError ? (
                    <p
                      id={errorId}
                      className="mt-1.5 text-xs font-medium text-red-700"
                    >
                      {rowError}
                    </p>
                  ) : null}
                </>
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
