"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { FieldError, FieldHint, Input, Label } from "@/components/ui/field";

import { saveIdDocument, type OnboardingFormState } from "../actions";

const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

/** Mirror the server-side accept list so the messages stay in sync. */
function validateFile(file: File): string | null {
  const isImage = file.type.startsWith("image/");
  const isPdf = file.type === "application/pdf";
  if (!isImage && !isPdf) {
    return "That file type isn't supported — upload a photo (JPG, PNG, HEIC) or a PDF.";
  }
  if (file.size > MAX_DOCUMENT_BYTES) {
    return "That file is over 10 MB — use a smaller photo or PDF.";
  }
  return null;
}

export function IdUploadForm({ hasDocument }: { hasDocument: boolean }) {
  const [state, formAction, pending] = useActionState<
    OnboardingFormState,
    FormData
  >(saveIdDocument, {});
  const [clientError, setClientError] = useState<string | null>(null);

  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setClientError(file ? validateFile(file) : null);
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    const file = new FormData(event.currentTarget).get("document");
    if (!(file instanceof File) || file.size === 0) {
      event.preventDefault();
      setClientError("Choose a photo or scan of your student ID.");
      return;
    }
    const error = validateFile(file);
    if (error) {
      // Block submit so the oversized/unsupported file never reaches the
      // Server Action (and never trips a raw framework error).
      event.preventDefault();
      setClientError(error);
    }
  }

  // Show the instant client-side message when present; otherwise fall back to
  // whatever the server returned.
  const error = clientError ?? state.error;

  return (
    <form action={formAction} onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label htmlFor="document">
          {hasDocument ? "Replace your student ID" : "Student ID photo"}
        </Label>
        <Input
          id="document"
          name="document"
          type="file"
          accept="image/*,application/pdf"
          onChange={handleChange}
          required
        />
        <FieldHint>
          A clear photo or PDF, up to 10 MB. Only the founders can see it —
          it&apos;s stored privately and reviewed manually.
        </FieldHint>
      </div>

      <FieldError>{error}</FieldError>

      <Button type="submit" size="lg" disabled={pending || clientError !== null}>
        {pending ? "Uploading…" : hasDocument ? "Replace ID" : "Upload student ID"}
      </Button>
    </form>
  );
}
