"use client";

import { useActionState } from "react";

import { signUpProvider, type AuthFormState } from "@/app/(auth)/actions";
import { AddressFields } from "@/components/auth/address-fields";
import { PasswordField } from "@/components/auth/password-field";
import { SignupSuccess } from "@/components/auth/signup-success";
import { Button } from "@/components/ui/button";
import { FieldError, FieldHint, Input, Label } from "@/components/ui/field";

// Latest DOB that still makes someone 18 today — nudges the date picker.
function maxDobToday() {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 18);
  return d.toISOString().slice(0, 10);
}

export function ProviderSignupForm() {
  const [state, formAction, pending] = useActionState<AuthFormState, FormData>(
    signUpProvider,
    {},
  );

  if (state.success) {
    return (
      <SignupSuccess
        email={state.email}
        message={state.success}
        extra="Then log in to continue with verification."
      />
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <Label htmlFor="fullName">Full name</Label>
        <Input id="fullName" name="fullName" autoComplete="name" required />
      </div>

      <div>
        <Label htmlFor="email">School email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="you@school.edu"
          required
        />
        <FieldHint>
          Must be a .edu address — it&apos;s how we verify you&apos;re a
          student.
        </FieldHint>
      </div>

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

      <PasswordField confirm />

      <AddressFields legend="Business / student address" />

      <FieldError>{state.error}</FieldError>

      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? "Creating account…" : "Create provider account"}
      </Button>
    </form>
  );
}
