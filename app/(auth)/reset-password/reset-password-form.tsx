"use client";

import { useActionState } from "react";

import { resetPassword, type AuthFormState } from "@/app/(auth)/actions";
import { PasswordField } from "@/components/auth/password-field";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field";

export function ResetPasswordForm() {
  const [state, formAction, pending] = useActionState<AuthFormState, FormData>(
    resetPassword,
    {},
  );

  return (
    <form action={formAction} className="space-y-4">
      <PasswordField label="New password" confirm confirmLabel="Confirm new password" />

      <FieldError>{state.error}</FieldError>

      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? "Updating…" : "Set new password"}
      </Button>
    </form>
  );
}
