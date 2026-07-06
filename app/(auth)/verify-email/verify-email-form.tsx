"use client";

import { useActionState } from "react";

import { resendConfirmation, type AuthFormState } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label } from "@/components/ui/field";

export function VerifyEmailForm({
  initialError,
  defaultEmail,
}: {
  initialError?: string;
  defaultEmail?: string;
}) {
  const [state, formAction, pending] = useActionState<AuthFormState, FormData>(
    resendConfirmation,
    initialError ? { error: initialError } : {},
  );

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          defaultValue={defaultEmail}
          required
        />
      </div>

      {state.success ? (
        <p className="text-sm font-medium text-green-700">{state.success}</p>
      ) : null}
      <FieldError>{state.error}</FieldError>

      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? "Sending…" : "Resend confirmation email"}
      </Button>
    </form>
  );
}
