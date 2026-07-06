"use client";

import { useActionState } from "react";

import { resendConfirmation, type AuthFormState } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field";

/**
 * "Check your email" panel shown after signup. Always offers a working resend
 * so an expired or lost confirmation link is never a dead end.
 */
export function SignupSuccess({
  email,
  message,
  extra,
}: {
  email?: string;
  message: string;
  extra?: string;
}) {
  const [state, formAction, pending] = useActionState<AuthFormState, FormData>(
    resendConfirmation,
    {},
  );

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-quad-200 bg-quad-50 p-4 text-sm text-quad-800">
        {message}
        {extra ? ` ${extra}` : ""}
      </div>

      <form action={formAction} className="space-y-2">
        <input type="hidden" name="email" value={email ?? ""} />
        <p className="text-sm text-ink-soft">
          Didn&apos;t get it? Check your spam folder, or resend below.
        </p>
        {state.success ? (
          <p className="text-sm font-medium text-green-700">{state.success}</p>
        ) : null}
        <FieldError>{state.error}</FieldError>
        <Button
          type="submit"
          variant="secondary"
          disabled={pending || !email}
        >
          {pending ? "Sending…" : "Resend confirmation email"}
        </Button>
      </form>
    </div>
  );
}
