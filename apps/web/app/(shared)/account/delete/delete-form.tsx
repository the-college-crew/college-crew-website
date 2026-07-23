"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import { FormLoader } from "@/components/form-loader";
import { Button, buttonClasses } from "@/components/ui/button";
import { FieldError, Input, Label } from "@/components/ui/field";

import { deleteAccount, type AccountFormState } from "../actions";

export function DeleteAccountForm() {
  const [state, formAction, pending] = useActionState<
    AccountFormState,
    FormData
  >(deleteAccount, {});
  const [confirmText, setConfirmText] = useState("");
  const armed = confirmText.trim().toUpperCase() === "DELETE";

  return (
    <form action={formAction} className="space-y-4">
      <FormLoader />
      <div>
        <Label htmlFor="confirm">
          Type <span className="font-semibold">DELETE</span> to confirm
        </Label>
        <Input
          id="confirm"
          name="confirm"
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          autoComplete="off"
          autoCapitalize="characters"
          className="max-w-xs"
        />
      </div>

      <FieldError>{state.error}</FieldError>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="danger" disabled={!armed || pending}>
          {pending ? "Deleting…" : "Permanently delete my account"}
        </Button>
        <Link
          href="/account?tab=delete"
          className={buttonClasses({ variant: "secondary" })}
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
