"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field";

import { confirmEmailLink, type ConfirmFormState } from "./actions";

const EMPTY: ConfirmFormState = {};

/**
 * The one click that spends the token. A form POST by design — see the auth
 * callback route for why this can't just happen on page load.
 */
export function ConfirmForm({
  tokenHash,
  type,
  next,
  label,
}: {
  tokenHash: string;
  type: string;
  next: string;
  label: string;
}) {
  const [state, formAction, pending] = useActionState(confirmEmailLink, EMPTY);

  return (
    <form action={formAction} className="mt-6 space-y-3">
      <input type="hidden" name="token_hash" value={tokenHash} />
      <input type="hidden" name="type" value={type} />
      <input type="hidden" name="next" value={next} />
      <FieldError>{state.error}</FieldError>
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "Confirming…" : label}
      </Button>
    </form>
  );
}
