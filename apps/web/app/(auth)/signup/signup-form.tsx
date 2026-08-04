"use client";

import { useActionState } from "react";

import { signUpCustomer, type AuthFormState } from "@/app/(auth)/actions";
import { AddressFields } from "@/components/auth/address-fields";
import { GoogleAuthOption } from "@/components/auth/google-auth-option";
import { PasswordField } from "@/components/auth/password-field";
import { SignupSuccess } from "@/components/auth/signup-success";
import { Button } from "@/components/ui/button";
import { FieldError, FieldHint, Input, Label } from "@/components/ui/field";

export function SignupForm({ oauthError }: { oauthError?: string }) {
  const [state, formAction, pending] = useActionState<AuthFormState, FormData>(
    signUpCustomer,
    {},
  );

  if (state.success) {
    return (
      <SignupSuccess
        email={state.email}
        message={state.success}
        redirectTo="/dashboard"
      />
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <GoogleAuthOption
        next="/dashboard"
        returnTo="/signup"
        initialError={oauthError}
      />

      <div>
        <Label htmlFor="fullName">Full name</Label>
        <Input id="fullName" name="fullName" autoComplete="name" required />
      </div>

      <div>
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
        />
        <FieldHint>
          You&apos;ll confirm this email before your first booking.
        </FieldHint>
      </div>

      <PasswordField confirm />

      <AddressFields legend="Home address" />

      <FieldError>{state.error}</FieldError>

      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? "Creating account…" : "Create account"}
      </Button>
    </form>
  );
}
