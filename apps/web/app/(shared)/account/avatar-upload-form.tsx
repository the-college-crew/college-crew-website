"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { FieldError, FieldHint, Input, Label } from "@/components/ui/field";
import {
  AVATAR_ACCEPT,
  PROVIDER_AVATARS_BUCKET,
  providerAvatarPath,
  validateAvatarFile,
} from "@/lib/media/provider-avatars";
import { createClient } from "@/lib/supabase/client";

import { uploadProviderAvatar } from "./provider-actions";

/**
 * Upload/replace the provider's single required profile photo. There is no
 * "remove" — the photo must stay set for the provider to be publicly visible.
 *
 * The file goes browser -> Supabase Storage directly and only the object key
 * reaches the Server Action, which keeps a 5 MB photo clear of the host's
 * ~4.5 MB Server-Action body cap.
 */
export function AvatarUploadForm({
  userId,
  imageUrl,
}: {
  userId: string;
  imageUrl: string | null;
}) {
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, startSaving] = useTransition();

  const busy = uploading || saving;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    const form = event.currentTarget;
    const value = new FormData(form).get("image");
    if (!(value instanceof File) || value.size === 0) {
      setError("Choose a photo to upload.");
      return;
    }
    const invalid = validateAvatarFile(value);
    if (invalid) {
      setError(invalid);
      return;
    }

    setUploading(true);
    const path = providerAvatarPath(userId, value);
    const { error: uploadError } = await createClient()
      .storage.from(PROVIDER_AVATARS_BUCKET)
      .upload(path, value, {
        cacheControl: "31536000",
        contentType: value.type,
        upsert: false,
      });
    setUploading(false);

    if (uploadError) {
      setError(`Photo upload failed: ${uploadError.message}`);
      return;
    }

    startSaving(async () => {
      const result = await uploadProviderAvatar(path);
      if (result.error) setError(result.error);
      if (result.success) {
        setSuccess(result.success);
        form.reset();
      }
    });
  }

  return (
    <div className="flex gap-4">
      <div className="h-20 w-20 shrink-0 overflow-hidden rounded-full bg-sky">
        {imageUrl ? (
          // Public asset; a plain image avoids cached optimizer copies after
          // the provider replaces it with a new object URL.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt="Your profile photo"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center px-2 text-center text-xs font-semibold text-viridian/60">
            No photo yet
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="min-w-0 flex-1 space-y-3">
        <div>
          <Label htmlFor="provider-avatar">
            {imageUrl ? "Replace photo" : "Upload photo"}
          </Label>
          <Input
            id="provider-avatar"
            name="image"
            type="file"
            accept={AVATAR_ACCEPT}
            disabled={busy}
            onChange={() => {
              setError(null);
              setSuccess(null);
            }}
            className="cursor-pointer file:mr-3 file:rounded-lg file:border-0 file:bg-honeydew file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-viridian"
          />
          <FieldHint>
            A clear headshot. This is the face customers see on Browse and your
            profile. JPG, PNG, or WebP, up to 5 MB.
          </FieldHint>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" size="sm" disabled={busy}>
            {busy ? "Uploading…" : imageUrl ? "Replace photo" : "Upload photo"}
          </Button>
          {success ? (
            <span aria-live="polite" className="text-sm font-medium text-quad-700">
              {success}
            </span>
          ) : null}
          <FieldError>{error}</FieldError>
        </div>
      </form>
    </div>
  );
}
