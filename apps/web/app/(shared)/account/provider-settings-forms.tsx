"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { SchoolAutocomplete } from "@/components/school-autocomplete";
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
  setOwnProviderActivity,
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

export function ProviderActivityForm({
  profile,
}: {
  profile: ProviderProfile;
}) {
  const [state, formAction, pending] = useActionState<
    ProviderSettingsFormState,
    FormData
  >(setOwnProviderActivity, {});
  const locked = profile.admin_forced_inactive;

  return (
    <form action={formAction} className="space-y-3">
      <div className="flex items-start justify-between gap-4 rounded-2xl border border-line bg-court/40 p-4">
        <div>
          <Label htmlFor="provider-is-active">Accept new requests</Label>
          <p className="mt-1 text-sm text-ink-soft">
            {locked
              ? "College Crew has made your listing inactive. Only an admin can reactivate it."
              : "Pause your listing whenever you need a break. Your profile, verification, and existing jobs stay intact."}
          </p>
        </div>
        <input
          id="provider-is-active"
          name="isActive"
          type="checkbox"
          value="true"
          defaultChecked={profile.is_active && !locked}
          disabled={locked || pending}
          aria-label="Accept new requests"
          className="mt-1 h-5 w-5 shrink-0 accent-viridian"
        />
      </div>
      {locked ? (
        <p className="text-sm font-medium text-red-700">
          Listing inactive by College Crew
        </p>
      ) : (
        <SaveRow state={state} pending={pending} label="Save listing status" />
      )}
      {locked ? <FieldError>{state.error}</FieldError> : null}
    </form>
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
            <option value="individual">Individual</option>
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
      <SchoolAutocomplete
        defaultName={profile.school_name}
        defaultSchoolId={profile.school_scorecard_id}
      />
      <div>
        <Label htmlFor="greekOrganization">
          Greek house or chapter (optional)
        </Label>
        <Input
          id="greekOrganization"
          name="greekOrganization"
          defaultValue={profile.greek_organization}
          maxLength={120}
          placeholder="e.g. Alpha Phi or Sigma Chi"
        />
        <FieldHint>Shown beneath your school on your public profile.</FieldHint>
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
