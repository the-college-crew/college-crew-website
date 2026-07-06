"use client";

import { useActionState } from "react";

import { requestPasswordReset, type AuthFormState } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label } from "@/components/ui/field";

export function ForgotPasswordForm({
  initialError,
}: {
  initialError?: string;
}) {
  const [state, formAction, pending] = useActionState<AuthFormState, FormData>(
    requestPasswordReset,
    initialError ? { error: initialError } : {},
  );

  if (state.success) {
    return (
      <div className="rounded-lg border border-quad-200 bg-quad-50 p-4 text-sm text-quad-800">
        {state.success}
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
        />
      </div>

      <FieldError>{state.error}</FieldError>

      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? "Sending…" : "Send reset link"}
      </Button>
    </form>
  );
}
