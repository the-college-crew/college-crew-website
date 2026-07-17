"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { FieldError, FieldHint, Input, Label } from "@/components/ui/field";

import {
  startProviderProfile,
  type OnboardingFormState,
} from "../actions";

/** Today's date for the DOB picker cap (a future birthday isn't a birthday). */
function maxDobToday() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Account step "Continue" for a signed-in user. Existing accounts upgrading to
 * providing supply the facts signup didn't collect: a date of birth (18+ gate)
 * and an optional company name. Accounts that already have both just continue.
 */
export function StartProviderForm({
  needsDateOfBirth,
  askCompanyName,
}: {
  needsDateOfBirth: boolean;
  askCompanyName: boolean;
}) {
  const [state, formAction, pending] = useActionState<
    OnboardingFormState,
    FormData
  >(startProviderProfile, {});

  return (
    <form action={formAction} className="space-y-4">
      {needsDateOfBirth ? (
        <div>
          <Label htmlFor="dateOfBirth">Date of birth</Label>
          <Input
            id="dateOfBirth"
            name="dateOfBirth"
            type="date"
            autoComplete="bday"
            max={maxDobToday()}
            required
          />
          <FieldHint>
            You must be 18 or older. We re-check this against your ID later.
          </FieldHint>
        </div>
      ) : null}

      {askCompanyName ? (
        <div>
          <Label htmlFor="companyName">Company name (optional)</Label>
          <Input id="companyName" name="companyName" autoComplete="organization" />
          <FieldHint>
            Run a small business (e.g. a window-washing company)? Add its name
            and we&apos;ll show that instead of your name to neighbors.
          </FieldHint>
        </div>
      ) : null}

      <FieldError>{state.error}</FieldError>

      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? "Continuing…" : "Continue to verification →"}
      </Button>
    </form>
  );
}
