"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { FieldError, FieldHint, Input, Label } from "@/components/ui/field";

import {
  uploadProviderAvatar,
  type ProviderSettingsFormState,
} from "./provider-actions";

/**
 * Upload/replace the provider's single required profile photo. There is no
 * "remove" — the photo must stay set for the provider to be publicly visible.
 */
export function AvatarUploadForm({ imageUrl }: { imageUrl: string | null }) {
  const [state, formAction, uploading] = useActionState<
    ProviderSettingsFormState,
    FormData
  >(uploadProviderAvatar, {});

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

      <form action={formAction} className="min-w-0 flex-1 space-y-3">
        <div>
          <Label htmlFor="provider-avatar">
            {imageUrl ? "Replace photo" : "Upload photo"}
          </Label>
          <Input
            id="provider-avatar"
            name="image"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="cursor-pointer file:mr-3 file:rounded-lg file:border-0 file:bg-honeydew file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-viridian"
          />
          <FieldHint>
            A clear headshot — this is the face customers see on Browse and your
            profile. JPG, PNG, or WebP, up to 5 MB.
          </FieldHint>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" size="sm" disabled={uploading}>
            {uploading ? "Uploading…" : imageUrl ? "Replace photo" : "Upload photo"}
          </Button>
          {state.success ? (
            <span className="text-sm font-medium text-quad-700">
              {state.success}
            </span>
          ) : null}
          <FieldError>{state.error}</FieldError>
        </div>
      </form>
    </div>
  );
}
