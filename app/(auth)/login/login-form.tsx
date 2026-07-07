"use client";

import Link from "next/link";
import { useTopLoader } from "nextjs-toploader";
import { useActionState, useEffect } from "react";

import { logIn, type AuthFormState } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label } from "@/components/ui/field";

export function LoginForm({
  next,
  initialError,
}: {
  next?: string;
  initialError?: string;
}) {
  const [state, formAction, pending] = useActionState<AuthFormState, FormData>(
    logIn,
    initialError ? { error: initialError } : {},
  );

  // logIn submits a form action that ends in a server-side redirect, which
  // nextjs-toploader's automatic hooks don't cover (only <Link> and
  // push/replace are). Drive the site-wide loader off `pending` by hand: it
  // runs while the action is in flight and clears on a failed login, which
  // returns an error instead of navigating.
  const loader = useTopLoader();
  useEffect(() => {
    if (pending) loader.start();
    else loader.done();
  }, [pending, loader]);

  return (
    <form action={formAction} className="space-y-4">
      {next ? <input type="hidden" name="next" value={next} /> : null}

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
