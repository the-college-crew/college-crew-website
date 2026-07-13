"use client";

import { useActionState, useState } from "react";

import { FormLoader } from "@/components/form-loader";
import { Button } from "@/components/ui/button";
import {
  FieldError,
  FieldHint,
  Input,
  Label,
  Select,
  Textarea,
} from "@/components/ui/field";
import {
  MINIMUM_NOTICE_HOURS,
  NOTICE_HOUR_PRESETS,
} from "@/lib/booking/policy";
import {
  PROVIDER_WEEKDAYS,
  defaultNoticeChoice,
  type ProviderAvailabilityValues,
  type ProviderSetupFieldErrors,
} from "@/lib/provider/setup";

export type AvailabilityFormState = {
  error?: string;
  success?: string;
  fieldErrors?: ProviderSetupFieldErrors;
};

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
  const [weekdays, setWeekdays] = useState(values.availability_weekdays);
  const [start, setStart] = useState(
    values.availability_start_local?.slice(0, 5) ?? "",
  );
  const [end, setEnd] = useState(
    values.availability_end_local?.slice(0, 5) ?? "",
  );
  const [note, setNote] = useState(values.availability_note);
  const [serviceZip, setServiceZip] = useState(values.service_zip ?? "");
  const [noticeChoice, setNoticeChoice] = useState(() =>
    defaultNoticeChoice(values.minimum_notice_hours),
  );
  const [customNotice, setCustomNotice] = useState(() =>
    defaultNoticeChoice(values.minimum_notice_hours) === "custom"
      ? String(values.minimum_notice_hours)
      : "",
  );

  function toggleWeekday(value: number, checked: boolean) {
    setWeekdays((current) =>
      checked
        ? [...new Set([...current, value])].sort((a, b) => a - b)
        : current.filter((day) => day !== value),
    );
  }

  return (
    <form action={formAction} className="space-y-5">
      {navigates ? <FormLoader /> : null}
      <fieldset>
        <legend className="mb-1.5 block text-sm font-medium">
          Days you generally work
        </legend>
        <div className="flex flex-wrap gap-2">
          {PROVIDER_WEEKDAYS.map(({ value, short, long }) => (
            <label
              key={value}
              className="flex items-center gap-1.5 rounded-full border border-line bg-paper px-3 py-1.5 text-sm has-checked:border-quad-500 has-checked:bg-quad-50 has-checked:font-semibold has-checked:text-quad-800"
            >
              <input
                type="checkbox"
                name={`weekday_${value}`}
                checked={weekdays.includes(value)}
                onChange={(event) => toggleWeekday(value, event.target.checked)}
                className="sr-only"
              />
              <span className="sm:hidden">{short}</span>
              <span className="hidden sm:inline">{long}</span>
            </label>
          ))}
        </div>
        <FieldHint>
          One shared weekly window keeps scheduling predictable during the pilot.
        </FieldHint>
        <FieldError>{state.fieldErrors?.weekdays}</FieldError>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="availabilityStart">Start time</Label>
          <Input
            id="availabilityStart"
            name="availabilityStart"
            type="time"
            value={start}
            onChange={(event) => setStart(event.target.value)}
            aria-invalid={state.fieldErrors?.availabilityStart ? true : undefined}
            required
          />
          <FieldError>{state.fieldErrors?.availabilityStart}</FieldError>
        </div>
        <div>
          <Label htmlFor="availabilityEnd">End time</Label>
          <Input
            id="availabilityEnd"
            name="availabilityEnd"
            type="time"
            value={end}
            onChange={(event) => setEnd(event.target.value)}
            aria-invalid={state.fieldErrors?.availabilityEnd ? true : undefined}
            required
          />
          <FieldError>{state.fieldErrors?.availabilityEnd}</FieldError>
        </div>
      </div>
      <FieldHint>Times are interpreted in Central Time.</FieldHint>

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

      <div className="grid gap-4 sm:grid-cols-2">
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

        <div>
          <Label htmlFor="noticeChoice">Minimum scheduling notice</Label>
          <Select
            id="noticeChoice"
            name="noticeChoice"
            value={noticeChoice}
            onChange={(event) => setNoticeChoice(event.target.value)}
          >
            {NOTICE_HOUR_PRESETS.map((hours) => (
              <option key={hours} value={hours}>
                {hours === 168 ? "1 week" : `${hours} hours`}
              </option>
            ))}
            <option value="custom">Custom hours</option>
          </Select>
          {noticeChoice === "custom" ? (
            <Input
              className="mt-2"
              name="customNoticeHours"
              type="number"
              min={MINIMUM_NOTICE_HOURS.min}
              max={MINIMUM_NOTICE_HOURS.max}
              step={1}
              value={customNotice}
              onChange={(event) => setCustomNotice(event.target.value)}
              aria-label="Custom minimum notice in hours"
              required
            />
          ) : null}
          <FieldHint>Whole hours from 3 through 168.</FieldHint>
          <FieldError>{state.fieldErrors?.minimumNoticeHours}</FieldError>
        </div>
      </div>

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
