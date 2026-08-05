"use client";

import { useActionState } from "react";

import {
  completeProfile,
  type AuthFormState,
} from "@/app/(auth)/actions";
import { AddressFields } from "@/components/auth/address-fields";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label } from "@/components/ui/field";
import type { Profile } from "@/lib/db/types";

export function CompleteProfileForm({
  profile,
  next,
}: {
  profile: Profile;
  next: string;
}) {
  const [state, formAction, pending] = useActionState<
    AuthFormState,
    FormData
  >(completeProfile, {});
  const providerIntent = next.startsWith("/provider/onboarding");

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="next" value={next} />

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
        legend={providerIntent ? "Business / student address" : "Home address"}
        defaults={{
          address_line1: profile.address_line1,
          address_line2: profile.address_line2,
          city: profile.city,
          state: profile.state,
          postal_code: profile.postal_code,
        }}
      />

      <div aria-live="polite">
        <FieldError>{state.error}</FieldError>
      </div>

      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? "Saving profile…" : "Save and continue"}
      </Button>
    </form>
  );
}
