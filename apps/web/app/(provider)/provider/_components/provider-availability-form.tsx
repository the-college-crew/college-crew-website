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
  MAX_AVAILABILITY_WINDOWS,
  PROVIDER_WEEKDAYS,
  defaultNoticeChoice,
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
  const [noticeChoice, setNoticeChoice] = useState(() =>
    defaultNoticeChoice(values.minimum_notice_hours),
  );
  const [customNotice, setCustomNotice] = useState(() =>
    defaultNoticeChoice(values.minimum_notice_hours) === "custom"
      ? String(values.minimum_notice_hours)
      : "",
  );

  // Which group currently owns each weekday — a day can only live in one
  // time window, so pills claimed elsewhere render disabled.
  const claimedBy = new Map<number, number>();
  groups.forEach((group, index) => {
    for (const day of group.weekdays) claimedBy.set(day, index);
  });
  const allDaysClaimed = claimedBy.size === PROVIDER_WEEKDAYS.length;

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

  function setGroupTime(
    groupIndex: number,
    field: "start" | "end",
    value: string,
  ) {
    setGroups((current) =>
      current.map((group, index) =>
        index === groupIndex ? { ...group, [field]: value } : group,
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
                  {PROVIDER_WEEKDAYS.map(({ value, short, long }) => {
                    const owner = claimedBy.get(value);
                    const claimedElsewhere =
                      owner !== undefined && owner !== groupIndex;
                    return (
                      <label
                        key={value}
                        title={
                          claimedElsewhere
                            ? "Set in another time window"
                            : undefined
                        }
                        className={
                          claimedElsewhere
                            ? "relative flex cursor-not-allowed items-center gap-1.5 rounded-full border border-line bg-stone/30 px-3 py-1.5 text-sm text-mist"
                            : "relative flex items-center gap-1.5 rounded-full border border-line bg-paper px-3 py-1.5 text-sm has-checked:border-quad-500 has-checked:bg-quad-50 has-checked:font-semibold has-checked:text-quad-800 has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-viridian"
                        }
                      >
                        <input
                          type="checkbox"
                          name={`windowDay_${groupIndex}_${value}`}
                          checked={group.weekdays.includes(value)}
                          disabled={claimedElsewhere}
                          onChange={(event) =>
                            toggleDay(groupIndex, value, event.target.checked)
                          }
                          className="absolute inset-0 m-0 h-full w-full cursor-pointer appearance-none rounded-full opacity-0 disabled:cursor-not-allowed"
                        />
                        <span className="sm:hidden">{short}</span>
                        <span className="hidden sm:inline">{long}</span>
                      </label>
                    );
                  })}
                </div>
                <FieldError>{groupErrors?.days}</FieldError>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label htmlFor={`windowStart_${groupIndex}`}>
                      Start time
                    </Label>
                    <Input
                      id={`windowStart_${groupIndex}`}
                      name={`windowStart_${groupIndex}`}
                      type="time"
                      value={group.start}
                      onChange={(event) =>
                        setGroupTime(groupIndex, "start", event.target.value)
                      }
                      aria-invalid={groupErrors?.start ? true : undefined}
                      required
                    />
                    <FieldError>{groupErrors?.start}</FieldError>
                  </div>
                  <div>
                    <Label htmlFor={`windowEnd_${groupIndex}`}>End time</Label>
                    <Input
                      id={`windowEnd_${groupIndex}`}
                      name={`windowEnd_${groupIndex}`}
                      type="time"
                      value={group.end}
                      onChange={(event) =>
                        setGroupTime(groupIndex, "end", event.target.value)
                      }
                      aria-invalid={groupErrors?.end ? true : undefined}
                      required
                    />
                    <FieldError>{groupErrors?.end}</FieldError>
                  </div>
                </div>

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

        {!allDaysClaimed && groups.length < MAX_AVAILABILITY_WINDOWS ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="mt-3"
            onClick={addGroup}
          >
            + Add days with different hours
          </Button>
        ) : null}

        <FieldHint>
          Group the days that share the same hours; add another window for days
          with different hours. Times are interpreted in Central Time.
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
