"use client";

import { useActionState, useEffect } from "react";

import {
  checkSignedIn,
  resendConfirmation,
  type AuthFormState,
} from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field";

/**
 * "Check your email" panel shown after signup. Always offers a working resend
 * so an expired or lost confirmation link is never a dead end.
 *
 * It also polls for a session: once the user confirms via the email link (in
 * another tab of the same browser, which sets the shared session cookie), this
 * tab detects it and navigates straight into the app — no manual reload.
 */
export function SignupSuccess({
  email,
  message,
  extra,
  redirectTo,
}: {
  email?: string;
  message: string;
  extra?: string;
  redirectTo: string;
}) {
  const [state, formAction, pending] = useActionState<AuthFormState, FormData>(
    resendConfirmation,
    {},
  );

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      if (document.visibilityState !== "visible") return;
      const signedIn = await checkSignedIn();
      if (signedIn && !cancelled) {
        // Full navigation so the server re-renders with the new session.
        window.location.assign(redirectTo);
      }
    }

    const interval = setInterval(poll, 3000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [redirectTo]);

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
        <Button type="submit" variant="secondary" disabled={pending || !email}>
          {pending ? "Sending…" : "Resend confirmation email"}
        </Button>
      </form>

      <p className="text-xs text-mist">
        This page updates automatically once you confirm — no need to come back
        to it.
      </p>
    </div>
  );
}
