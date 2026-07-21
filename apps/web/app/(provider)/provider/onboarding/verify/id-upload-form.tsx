"use client";

import { useTopLoader } from "nextjs-toploader";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { FieldError, FieldHint, Input, Label } from "@/components/ui/field";
import {
  ID_DOCUMENT_ACCEPT,
  ID_DOCUMENTS_BUCKET,
  idDocumentPath,
  LICENSE_SIDE_LABEL,
  validateLicenseFile,
  type LicenseSide,
} from "@/lib/media/id-documents";
import { createClient } from "@/lib/supabase/client";

import { saveIdDocument } from "../actions";

/**
 * License photos go browser -> Supabase Storage directly, then a Server Action
 * records the two object keys. Routing the bytes through the action instead
 * would put them against the host's ~4.5 MB request-body cap, which a pair of
 * phone photos blows past with no useful error.
 */
export function IdUploadForm({
  userId,
  hasFront,
  hasBack,
}: {
  userId: string;
  hasFront: boolean;
  hasBack: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, startSaving] = useTransition();
  const loader = useTopLoader();

  const busy = uploading || saving;
  const bothUploaded = hasFront && hasBack;

  function pickFile(data: FormData, side: LicenseSide): File | null {
    const value = data.get(side);
    return value instanceof File && value.size > 0 ? value : null;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const data = new FormData(event.currentTarget);
    const front = pickFile(data, "front");
    const back = pickFile(data, "back");

    // Each side is only required if it isn't already on record.
    if (!front && !hasFront) {
      setError("Choose a photo of the front of your license.");
      return;
    }
    if (!back && !hasBack) {
      setError("Choose a photo of the back (barcode side) of your license.");
      return;
    }
    if (!front && !back) {
      setError("Choose a photo to upload.");
      return;
    }

    const chosen = ([["front", front], ["back", back]] as const).filter(
      (entry): entry is [LicenseSide, File] => entry[1] !== null,
    );
    for (const [side, file] of chosen) {
      const invalid = validateLicenseFile(file, side);
      if (invalid) {
        setError(invalid);
        return;
      }
    }

    setUploading(true);
    loader.start();
    const supabase = createClient();
    const uploaded: { frontPath?: string; backPath?: string } = {};

    for (const [side, file] of chosen) {
      setStatus(`Uploading the ${LICENSE_SIDE_LABEL[side]}…`);
      const path = idDocumentPath(userId, side, file);
      const { error: uploadError } = await supabase.storage
        .from(ID_DOCUMENTS_BUCKET)
        .upload(path, file, {
          contentType: file.type || undefined,
          upsert: false,
        });

      if (uploadError) {
        setError(`Upload failed: ${uploadError.message}`);
        setStatus(null);
        setUploading(false);
        loader.done();
        return;
      }
      // A side that lands is kept even if the other one fails: the action
      // saves each column independently.
      if (side === "front") uploaded.frontPath = path;
      else uploaded.backPath = path;
    }

    setStatus("Saving…");
    setUploading(false);
    startSaving(async () => {
      const result = await saveIdDocument(uploaded);
      // Success redirects, so reaching here means the save was rejected.
      if (result?.error) {
        setError(result.error);
        setStatus(null);
        loader.done();
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label htmlFor="front">
          {hasFront ? "Replace the front of your license" : "Front of license"}
        </Label>
        <Input
          id="front"
          name="front"
          type="file"
          accept={ID_DOCUMENT_ACCEPT}
          disabled={busy}
          onChange={() => setError(null)}
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
          accept={ID_DOCUMENT_ACCEPT}
          disabled={busy}
          onChange={() => setError(null)}
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

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="lg" disabled={busy}>
          {busy
            ? "Uploading…"
            : bothUploaded
              ? "Replace license photos"
              : "Upload license photos"}
        </Button>
        {busy && status ? (
          <span aria-live="polite" className="text-sm text-ink-soft">
            {status}
          </span>
        ) : null}
      </div>
    </form>
  );
}
