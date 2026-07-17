"use client";

import { useActionState, useState } from "react";

import { FormLoader } from "@/components/form-loader";
import { Button } from "@/components/ui/button";
import { FieldError, FieldHint } from "@/components/ui/field";
import type { Service } from "@/lib/db/types";
import { HOURLY_RATE_INPUT_CONSTRAINTS } from "@/lib/provider/setup";
import { cn } from "@/lib/utils";

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
      <div className="rounded-xl bg-honeydew/45 px-4 py-3 text-sm text-viridian">
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
              className={cn(
                "rounded-xl border p-4 transition-colors",
                row.offered
                  ? "border-viridian bg-honeydew/45"
                  : "border-stone bg-paper hover:border-viridian/45 hover:bg-shell",
              )}
            >
              <label className="flex cursor-pointer items-center gap-3 text-sm font-semibold text-ink">
                <input
                  type="checkbox"
                  name={`offer_${service.id}`}
                  checked={row.offered}
                  onChange={(event) =>
                    update(service.id, { offered: event.target.checked })
                  }
                  className="peer sr-only"
                />
                <span
                  aria-hidden
                  className={cn(
                    "grid size-5 shrink-0 place-items-center rounded-full border-[1.6px] transition-colors peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-viridian",
                    row.offered
                      ? "border-viridian bg-viridian text-shell"
                      : "border-viridian/40 bg-paper text-transparent",
                  )}
                >
                  {/* Drawn check, same idiom as the brand-select chevron. */}
                  <svg viewBox="0 0 20 20" fill="none" className="size-3">
                    <path
                      d="M4.5 10.5l3.4 3.4L15.5 6.5"
                      stroke="currentColor"
                      strokeWidth={2.4}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
                {service.name}
              </label>

              {row.offered ? (
                <div className="mt-3 max-w-xs pl-8">
                  <div
                    className={cn(
                      "flex items-center rounded-xl border-[1.4px] bg-paper transition-colors focus-within:border-viridian focus-within:ring-[3px] focus-within:ring-viridian/15",
                      rowError
                        ? "border-red-300"
                        : "border-viridian/25 hover:border-viridian/45",
                    )}
                  >
                    <span
                      aria-hidden
                      className="pl-3.5 text-sm font-semibold text-ink-soft"
                    >
                      $
                    </span>
                    <input
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
                      className="w-full bg-transparent px-2 py-2 text-sm text-ink placeholder:text-mist focus:outline-none"
                    />
                    <span
                      aria-hidden
                      className="shrink-0 pr-3.5 text-sm font-semibold text-ink-soft"
                    >
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
