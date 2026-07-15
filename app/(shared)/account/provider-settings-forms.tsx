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
  updateProviderProfile,
  type ProviderSettingsFormState,
} from "./provider-actions";

function SaveRow({
  state,
  pending,
  label = "Save",
}: {
  state: ProviderSettingsFormState;
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

export function ProviderProfileForm({ profile }: { profile: ProviderProfile }) {
  const [state, formAction, pending] = useActionState<
    ProviderSettingsFormState,
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
            <option value="individual">Hardworking individual</option>
            <option value="business">Student business</option>
          </Select>
        </div>
      </div>
      <div>
        <Label htmlFor="companyName">Company name (optional)</Label>
        <Input
          id="companyName"
          name="companyName"
          defaultValue={profile.company_name ?? ""}
        />
        <FieldHint>
          If you run a small business, this replaces your display name on
          Browse and your public profile.
        </FieldHint>
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
