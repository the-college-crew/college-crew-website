"use client";

import { useActionState } from "react";

import { signUpProvider, type AuthFormState } from "@/app/(auth)/actions";
import { AddressFields } from "@/components/auth/address-fields";
import { GoogleAuthOption } from "@/components/auth/google-auth-option";
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

export function ProviderSignupForm({ oauthError }: { oauthError?: string }) {
  const [state, formAction, pending] = useActionState<AuthFormState, FormData>(
    signUpProvider,
    {},
  );

  if (state.success) {
    return (
      <SignupSuccess
        email={state.email}
        message={state.success}
        extra="We'll take you to the next step automatically."
        redirectTo="/provider/onboarding/account"
      />
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <GoogleAuthOption
        next="/provider/onboarding/account"
        returnTo="/provider/onboarding/account"
        initialError={oauthError}
      />

      <div>
        <Label htmlFor="fullName">Full name</Label>
        <Input id="fullName" name="fullName" autoComplete="name" required />
      </div>

      <div>
        <Label htmlFor="companyName">Company name (optional)</Label>
        <Input id="companyName" name="companyName" autoComplete="organization" />
        <FieldHint>
          Run a small business (e.g. a window-washing company)? Add its name
          and we&apos;ll show that instead of your name to neighbors.
        </FieldHint>
      </div>

      <div>
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="you@email.com"
          required
        />
        <FieldHint>
          Use any email — you&apos;ll verify your school (.edu) email during
          onboarding to confirm you&apos;re a student.
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
