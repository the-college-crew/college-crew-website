"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { FieldError, FieldHint, Input, Label } from "@/components/ui/field";

import { saveIdDocument, type OnboardingFormState } from "../actions";

export function IdUploadForm({ hasDocument }: { hasDocument: boolean }) {
  const [state, formAction, pending] = useActionState<
    OnboardingFormState,
    FormData
  >(saveIdDocument, {});

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <Label htmlFor="document">
          {hasDocument ? "Replace your student ID" : "Student ID photo"}
        </Label>
        <Input
          id="document"
          name="document"
          type="file"
          accept="image/*,application/pdf"
          required
        />
        <FieldHint>
          A clear photo or PDF, up to 10 MB. Only the founders can see it —
          it&apos;s stored privately and reviewed manually.
        </FieldHint>
      </div>

      <FieldError>{state.error}</FieldError>

      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "Uploading…" : "Upload & continue →"}
      </Button>
    </form>
  );
}
