"use client";

import { useActionState, useState } from "react";

import { FormLoader } from "@/components/form-loader";
import { WindowRail } from "@/components/scheduling/window-rail";
import { Button } from "@/components/ui/button";
import {
  FieldError,
  FieldHint,
  Input,
  Label,
  Textarea,
} from "@/components/ui/field";
import {
  MAX_AVAILABILITY_WINDOWS,
  PROVIDER_WEEKDAYS,
  groupAvailabilityWindows,
  type AvailabilityDayGroup,
  type ProviderAvailabilityValues,
  type ProviderSetupFieldErrors,
} from "@/lib/provider/setup";

export type AvailabilityFormState = {
  error?: string;
  success?: string;
  fieldErrors?: ProviderSetupFieldErrors;
};

const EMPTY_GROUP: AvailabilityDayGroup = { weekdays: [], start: "", end: "" };

export function ProviderAvailabilityForm({
  values,
  action,
  submitLabel,
  navigates = false,
}: {
  values: ProviderAvailabilityValues;
  action: (
    previous: AvailabilityFormState,
    formData: FormData,
  ) => Promise<AvailabilityFormState>;
  submitLabel: string;
  navigates?: boolean;
}) {
  const [state, formAction, pending] = useActionState<
    AvailabilityFormState,
    FormData
  >(action, {});
  const [groups, setGroups] = useState<AvailabilityDayGroup[]>(() => {
    const initial = groupAvailabilityWindows(values.windows);
    return initial.length > 0 ? initial : [EMPTY_GROUP];
  });
  const [note, setNote] = useState(values.availability_note);
  const [serviceZip, setServiceZip] = useState(values.service_zip ?? "");


  function toggleDay(groupIndex: number, day: number, checked: boolean) {
    setGroups((current) =>
      current.map((group, index) =>
        index === groupIndex
          ? {
              ...group,
              weekdays: checked
                ? [...new Set([...group.weekdays, day])].sort((a, b) => a - b)
                : group.weekdays.filter((value) => value !== day),
            }
          : group,
      ),
    );
  }

  function setGroupWindow(
    groupIndex: number,
    next: { start: string; end: string },
  ) {
    setGroups((current) =>
      current.map((group, index) =>
        index === groupIndex ? { ...group, ...next } : group,
      ),
    );
  }

  function addGroup() {
    setGroups((current) =>
      current.length < MAX_AVAILABILITY_WINDOWS
        ? [...current, EMPTY_GROUP]
        : current,
    );
  }

  function removeGroup(groupIndex: number) {
    setGroups((current) =>
      current.length > 1
        ? current.filter((_, index) => index !== groupIndex)
        : current,
    );
  }

  return (
    <form action={formAction} className="space-y-5">
      {navigates ? <FormLoader /> : null}
      <input type="hidden" name="windowCount" value={groups.length} />

      <fieldset>
        <legend className="mb-1.5 block text-sm font-medium">
          Days and hours you work
        </legend>
        <div className="space-y-3">
          {groups.map((group, groupIndex) => {
            const groupErrors = state.fieldErrors?.windows?.[groupIndex];
            return (
              <div
                key={groupIndex}
                className="space-y-3 rounded-xl border border-line bg-paper p-4"
              >
                <div className="flex flex-wrap gap-2">
                  {/* A day can appear in more than one window now: mornings
                      before class and evenings after are two periods on the
                      same weekday. Only overlapping hours are rejected. */}
                  {PROVIDER_WEEKDAYS.map(({ value, short, long }) => (
                    <label
                      key={value}
                      className="relative flex items-center gap-1.5 rounded-full border border-line bg-paper px-3 py-1.5 text-sm has-checked:border-quad-500 has-checked:bg-quad-50 has-checked:font-semibold has-checked:text-quad-800 has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-viridian"
                    >
                      <input
                        type="checkbox"
                        name={`windowDay_${groupIndex}_${value}`}
                        checked={group.weekdays.includes(value)}
                        onChange={(event) =>
                          toggleDay(groupIndex, value, event.target.checked)
                        }
                        className="absolute inset-0 m-0 h-full w-full cursor-pointer appearance-none rounded-full opacity-0"
                      />
                      <span className="sm:hidden">{short}</span>
                      <span className="hidden sm:inline">{long}</span>
                    </label>
                  ))}
                </div>
                <FieldError>{groupErrors?.days}</FieldError>

                <WindowRail
                  railKey={`window-${groupIndex}`}
                  heading="Hours on these days"
                  start={group.start}
                  end={group.end}
                  onChange={(next) => setGroupWindow(groupIndex, next)}
                />
                {/* The rail is the control; these carry its value to the same
                    fields parseProviderAvailabilityForm already reads. */}
                <input
                  type="hidden"
                  name={`windowStart_${groupIndex}`}
                  value={group.start}
                />
                <input
                  type="hidden"
                  name={`windowEnd_${groupIndex}`}
                  value={group.end}
                />
                <FieldError>{groupErrors?.start ?? groupErrors?.end}</FieldError>

                {groups.length > 1 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeGroup(groupIndex)}
                  >
                    Remove this window
                  </Button>
                ) : null}
              </div>
            );
          })}
        </div>

        {groups.length < MAX_AVAILABILITY_WINDOWS ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="mt-3"
            onClick={addGroup}
          >
            + Add another set of hours
          </Button>
        ) : null}

        <FieldHint>
          Group the days that share the same hours, then drag those hours on the
          rail. Add another set for different hours, including a second stretch
          on a day you already picked. Times are Central.
        </FieldHint>
        <FieldError>{state.fieldErrors?.weekdays}</FieldError>
      </fieldset>

      <div>
        <Label htmlFor="availabilityNote">Public availability note</Label>
        <Textarea
          id="availabilityNote"
          name="availabilityNote"
          rows={3}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="For example: Weekday afternoons after class."
          aria-invalid={state.fieldErrors?.availabilityNote ? true : undefined}
        />
        <FieldHint>Shown to customers; do not include contact information.</FieldHint>
        <FieldError>{state.fieldErrors?.availabilityNote}</FieldError>
      </div>

      <div>
        <Label htmlFor="serviceZip">Service ZIP</Label>
        <Input
          id="serviceZip"
          name="serviceZip"
          inputMode="numeric"
          pattern="[0-9]{5}"
          maxLength={5}
          value={serviceZip}
          onChange={(event) => setServiceZip(event.target.value)}
          placeholder="60614"
          aria-invalid={state.fieldErrors?.serviceZip ? true : undefined}
          required
        />
        <FieldHint>Private. Used for nearby recommendations only.</FieldHint>
        <FieldError>{state.fieldErrors?.serviceZip}</FieldError>
      </div>

      <p className="rounded-lg border border-line bg-court px-3 py-2 text-xs text-mist">
        Customers book you at least 12 hours ahead, and you have 2 hours to
        accept each request.
      </p>

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
