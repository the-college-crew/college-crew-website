"use client";

import { useActionState } from "react";

import { AddressFields } from "@/components/auth/address-fields";
import { PasswordField } from "@/components/auth/password-field";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label } from "@/components/ui/field";
import type { Profile } from "@/lib/db/types";

import {
  updatePassword,
  updateProfile,
  type AccountFormState,
} from "./actions";

function SaveRow({
  state,
  pending,
  label = "Save",
}: {
  state: AccountFormState;
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

export function AccountProfileForm({ profile }: { profile: Profile }) {
  const [state, formAction, pending] = useActionState<
    AccountFormState,
    FormData
  >(updateProfile, {});

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <Label htmlFor="fullName">Full name</Label>
        <Input
          id="fullName"
          name="fullName"
          autoComplete="name"
          defaultValue={profile.full_name}
          required
        />
      </div>

      <AddressFields
        legend="Address"
        defaults={{
          address_line1: profile.address_line1,
          address_line2: profile.address_line2,
          city: profile.city,
          state: profile.state,
          postal_code: profile.postal_code,
        }}
      />

      <SaveRow state={state} pending={pending} label="Save changes" />
    </form>
  );
}

export function AccountPasswordForm() {
  const [state, formAction, pending] = useActionState<
    AccountFormState,
    FormData
  >(updatePassword, {});

  return (
    <form action={formAction} className="space-y-4">
      <div className="max-w-sm">
        <PasswordField
          label="New password"
          confirm
          confirmLabel="Confirm new password"
        />
      </div>
      <SaveRow state={state} pending={pending} label="Update password" />
    </form>
  );
}
