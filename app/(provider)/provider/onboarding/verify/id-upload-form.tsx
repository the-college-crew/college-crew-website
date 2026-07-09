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

export function IdUploadForm({
  hasFront,
  hasBack,
}: {
  hasFront: boolean;
  hasBack: boolean;
}) {
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
    const data = new FormData(event.currentTarget);
    const front = data.get("front");
    const back = data.get("back");
    const frontFile = front instanceof File && front.size > 0 ? front : null;
    const backFile = back instanceof File && back.size > 0 ? back : null;

    // Each side is only required if it isn't already on record. Block submit
    // for a missing-but-required side, or an unsupported/oversized file, so the
    // Server Action never trips a raw framework error.
    if (!frontFile && !hasFront) {
      event.preventDefault();
      setClientError("Choose a photo of the front of your license.");
      return;
    }
    if (!backFile && !hasBack) {
      event.preventDefault();
      setClientError("Choose a photo of the back (barcode side) of your license.");
      return;
    }
    for (const file of [frontFile, backFile]) {
      if (!file) continue;
      const error = validateFile(file);
      if (error) {
        event.preventDefault();
        setClientError(error);
        return;
      }
    }
  }

  // Show the instant client-side message when present; otherwise fall back to
  // whatever the server returned.
  const error = clientError ?? state.error;
  const bothUploaded = hasFront && hasBack;

  return (
    <form action={formAction} onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label htmlFor="front">
          {hasFront ? "Replace the front of your license" : "Front of license"}
        </Label>
        <Input
          id="front"
          name="front"
          type="file"
          accept="image/*,application/pdf"
          onChange={handleChange}
          required={!hasFront}
        />
        <FieldHint>
          {hasFront
            ? "Uploaded ✓ — choose a new file only if you need to replace it."
            : "A clear photo of the front, up to 10 MB."}
        </FieldHint>
      </div>

      <div>
        <Label htmlFor="back">
          {hasBack
            ? "Replace the back (barcode side)"
            : "Back of license (barcode side)"}
        </Label>
        <Input
          id="back"
          name="back"
          type="file"
          accept="image/*,application/pdf"
          onChange={handleChange}
          required={!hasBack}
        />
        <FieldHint>
          {hasBack
            ? "Uploaded ✓ — choose a new file only if you need to replace it."
            : "A clear photo of the barcode side, up to 10 MB."}
        </FieldHint>
      </div>

      <FieldHint>
        Only the founders can see these — they&apos;re stored privately and
        reviewed manually.
      </FieldHint>

      <FieldError>{error}</FieldError>

      <Button type="submit" size="lg" disabled={pending || clientError !== null}>
        {pending
          ? "Uploading…"
          : bothUploaded
            ? "Replace license photos"
            : "Upload license photos"}
      </Button>
    </form>
  );
}
