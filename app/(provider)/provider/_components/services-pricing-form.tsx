"use client";

import { useActionState, useState } from "react";

import { FormLoader } from "@/components/form-loader";
import { Button } from "@/components/ui/button";
import { FieldError, FieldHint, Input } from "@/components/ui/field";
import type { Service } from "@/lib/db/types";
import { HOURLY_RATE_INPUT_CONSTRAINTS } from "@/lib/provider/setup";

export type Offering = {
  service_id: string;
  hourly_rate_cents: number | null;
};

type FormState = {
  error?: string;
  success?: string;
  fieldErrors?: Record<string, string>;
};

/** One editable row's state — the single source of truth for that service. */
type Row = {
  offered: boolean;
  rate: string; // dollars per hour, as typed
};

function initialRows(services: Service[], offerings: Offering[]): Record<string, Row> {
  const byServiceId = new Map(offerings.map((o) => [o.service_id, o]));
  return Object.fromEntries(
    services.map((service) => {
      const existing = byServiceId.get(service.id);
      const row: Row = {
        offered: Boolean(existing),
        // Never infer or prefill an hourly rate from legacy fixed/quote data.
        rate:
          existing?.hourly_rate_cents !== null &&
          existing?.hourly_rate_cents !== undefined
            ? String(existing.hourly_rate_cents / 100)
            : "",
      };
      return [service.id, row];
    }),
  );
}

/**
 * One row per live service: offer it or not, at what hourly rate.
 * Used in onboarding (step 3) and in Profile & settings, which is the
 * pricing source of truth after onboarding (SPEC §3).
 *
 * Every field is controlled so a React 19 Server Action validation response
 * cannot wipe the provider's typed rates.
 */
export function ServicesPricingForm({
  services,
  offerings,
  action,
  submitLabel,
  navigates = false,
}: {
  services: Service[];
  offerings: Offering[];
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  submitLabel: string;
  /**
   * True when the action redirects on success (onboarding step 3 → review), so
   * the site-wide top-loader should run. The settings usage returns a success
   * message and stays put, so it leaves this off to avoid a stray flash.
   */
  navigates?: boolean;
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
      {navigates ? <FormLoader /> : null}
      <div className="rounded-lg border border-quad-200 bg-quad-50 p-3 text-sm text-quad-800">
        Customers pay for at least one hour. After that, billing uses 15-minute
        increments based on the completed job time.
      </div>
      <ul className="space-y-3">
        {services.map((service) => {
          const row = rows[service.id];
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
                <div className="mt-3 max-w-xs">
                  <div className="flex items-center gap-2">
                    <span aria-hidden className="font-semibold text-ink-soft">
                      $
                    </span>
                    <Input
                      type="number"
                      name={`rate_${service.id}`}
                      aria-label={`${service.name} hourly rate in dollars`}
                      placeholder="45"
                      min={HOURLY_RATE_INPUT_CONSTRAINTS.min}
                      step={HOURLY_RATE_INPUT_CONSTRAINTS.step}
                      inputMode="decimal"
                      value={row.rate}
                      onChange={(event) =>
                        update(service.id, { rate: event.target.value })
                      }
                      aria-invalid={rowError ? true : undefined}
                      aria-describedby={rowError ? errorId : undefined}
                    />
                    <span className="shrink-0 text-sm font-semibold text-ink-soft">
                      / hr
                    </span>
                  </div>
                  <FieldHint>
                    Your rate before College Crew&apos;s provider fee.
                  </FieldHint>
                  {rowError ? (
                    <p
                      id={errorId}
                      className="mt-1.5 text-xs font-medium text-red-700"
                    >
                      {rowError}
                    </p>
                  ) : null}
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
