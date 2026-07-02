"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import {
  FieldError,
  FieldHint,
  Input,
  Label,
  Select,
  Textarea,
} from "@/components/ui/field";
import type { ProviderProfile } from "@/lib/db/types";

import {
  updateAvailability,
  updatePassword,
  updateProviderProfile,
  type SettingsFormState,
} from "./actions";

function SaveRow({
  state,
  pending,
  label = "Save",
}: {
  state: SettingsFormState;
  pending: boolean;
  label?: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "Saving…" : label}
      </Button>
      {state.success ? (
        <span className="text-sm font-medium text-quad-700">
          {state.success}
        </span>
      ) : null}
      <FieldError>{state.error}</FieldError>
    </div>
  );
}

export function ProfileForm({ profile }: { profile: ProviderProfile }) {
  const [state, formAction, pending] = useActionState<
    SettingsFormState,
    FormData
  >(updateProviderProfile, {});

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="displayName">Display name</Label>
          <Input
            id="displayName"
            name="displayName"
            defaultValue={profile.display_name}
            required
          />
          <FieldHint>Shown on Browse and your public profile.</FieldHint>
        </div>
        <div>
          <Label htmlFor="providerType">Provider type</Label>
          <Select
            id="providerType"
            name="providerType"
            defaultValue={profile.provider_type}
          >
            <option value="individual">Individual student</option>
            <option value="business">Student business</option>
          </Select>
        </div>
      </div>
      <div>
        <Label htmlFor="neighborhood">Neighborhood</Label>
        <Input
          id="neighborhood"
          name="neighborhood"
          defaultValue={profile.neighborhood}
          placeholder="Where you work"
        />
      </div>
      <div>
        <Label htmlFor="bio">Bio</Label>
        <Textarea
          id="bio"
          name="bio"
          rows={4}
          defaultValue={profile.bio}
          placeholder="Who you are, what you're studying, why neighbors can count on you…"
        />
      </div>
      <SaveRow state={state} pending={pending} label="Save profile" />
    </form>
  );
}

const DAYS = [
  ["mon", "Mon"],
  ["tue", "Tue"],
  ["wed", "Wed"],
  ["thu", "Thu"],
  ["fri", "Fri"],
  ["sat", "Sat"],
  ["sun", "Sun"],
] as const;

export function AvailabilityForm({ profile }: { profile: ProviderProfile }) {
  const [state, formAction, pending] = useActionState<
    SettingsFormState,
    FormData
  >(updateAvailability, {});

  const availability = (profile.availability ?? {}) as {
    days?: string[];
    note?: string;
  };

  return (
    <form action={formAction} className="space-y-4">
      <fieldset>
        <legend className="mb-1.5 block text-sm font-medium">
          Days you generally work
        </legend>
        <div className="flex flex-wrap gap-2">
          {DAYS.map(([key, label]) => (
            <label
              key={key}
              className="flex items-center gap-1.5 rounded-full border border-line bg-paper px-3 py-1.5 text-sm has-checked:border-quad-500 has-checked:bg-quad-50 has-checked:font-semibold has-checked:text-quad-800"
            >
              <input
                type="checkbox"
                name={`day_${key}`}
                defaultChecked={availability.days?.includes(key)}
                className="sr-only"
              />
              {label}
            </label>
          ))}
        </div>
        <FieldHint>
          Kept simple for the pilot — per-service schedules come later.
        </FieldHint>
      </fieldset>
      <div>
        <Label htmlFor="note">Availability note</Label>
        <Input
          id="note"
          name="note"
          defaultValue={availability.note ?? ""}
          placeholder="e.g. Weekday afternoons after 3pm, weekends anytime"
        />
      </div>
      <SaveRow state={state} pending={pending} label="Save availability" />
    </form>
  );
}

export function PasswordForm() {
  const [state, formAction, pending] = useActionState<
    SettingsFormState,
    FormData
  >(updatePassword, {});

  return (
    <form action={formAction} className="space-y-4">
      <div className="max-w-xs">
        <Label htmlFor="password">New password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
        />
      </div>
      <SaveRow state={state} pending={pending} label="Update password" />
    </form>
  );
}
