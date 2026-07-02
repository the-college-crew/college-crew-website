"use client";

import { useActionState } from "react";

import { signUpProvider, type AuthFormState } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { FieldError, FieldHint, Input, Label } from "@/components/ui/field";

export function ProviderSignupForm() {
  const [state, formAction, pending] = useActionState<AuthFormState, FormData>(
    signUpProvider,
    {},
  );

  if (state.success) {
    return (
      <div className="rounded-lg border border-quad-200 bg-quad-50 p-4 text-sm text-quad-800">
        {state.success} Then log in to continue with verification.
      </div>
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
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
        />
      </div>

      <label className="flex items-start gap-2 text-sm text-ink-soft">
        <input type="checkbox" name="over18" required className="mt-0.5" />
        I&apos;m 18 or older.
      </label>

      <FieldError>{state.error}</FieldError>

      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? "Creating account…" : "Create provider account"}
      </Button>
    </form>
  );
}
