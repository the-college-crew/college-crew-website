"use client";

import Link from "next/link";
import { useActionState } from "react";

import { logIn, type AuthFormState } from "@/app/(auth)/actions";
import { GoogleAuthOption } from "@/components/auth/google-auth-option";
import { Button } from "@/components/ui/button";
import { FormLoader } from "@/components/form-loader";
import { FieldError, Input, Label } from "@/components/ui/field";

export function LoginForm({
  next,
  oauthError,
}: {
  next?: string;
  oauthError?: string;
}) {
  const [state, formAction, pending] = useActionState<AuthFormState, FormData>(
    logIn,
    {},
  );

  return (
    <form action={formAction} className="space-y-4">
      {/* logIn ends in a server-side redirect, which nextjs-toploader's auto
          hooks don't start; FormLoader drives the bar off the form's pending
          state and clears it on a failed login that returns an error. */}
      <FormLoader />
      {next ? <input type="hidden" name="next" value={next} /> : null}

      <GoogleAuthOption
        next={next}
        returnTo={next ? `/login?next=${encodeURIComponent(next)}` : "/login"}
        initialError={oauthError}
      />

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

      <div>
        <div className="flex items-baseline justify-between">
          <Label htmlFor="password">Password</Label>
          <Link
            href="/forgot-password"
            className="mb-1.5 text-xs font-medium text-ink-soft hover:text-ink"
          >
            Forgot password?
          </Link>
        </div>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </div>

      <FieldError>{state.error}</FieldError>

      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? "Logging in…" : "Log in"}
      </Button>
    </form>
  );
}
