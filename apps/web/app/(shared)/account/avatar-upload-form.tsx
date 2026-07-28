"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { PhotoRepositioner } from "@/components/photo-repositioner";
import { Button } from "@/components/ui/button";
import { FieldError, FieldHint, Input, Label } from "@/components/ui/field";
import { PROVIDER_AVATARS_BUCKET } from "@/lib/media/provider-avatars";
import {
  PROVIDER_PHOTO_ACCEPT,
  providerPhotoPath,
  validateProviderPhoto,
} from "@/lib/media/provider-photos";
import { createClient } from "@/lib/supabase/client";

import { uploadProviderAvatar } from "./provider-actions";

/**
 * Upload or replace the provider's required profile photo. The selected file
 * is previewed locally, positioned in its final circular crop, and only then
 * uploaded directly to Storage.
 */
export function AvatarUploadForm({
  userId,
  imageUrl,
  focalX,
  focalY,
}: {
  userId: string;
  imageUrl: string | null;
  focalX: number;
  focalY: number;
}) {
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [position, setPosition] = useState({ x: 50, y: 50 });
  const [fileInputKey, setFileInputKey] = useState(0);
  const dialogRef = useRef<HTMLDivElement>(null);
  const busyRef = useRef(false);

  const closePreview = useCallback(() => {
    if (busyRef.current) return;
    setSelectedFile(null);
    setPreviewUrl(null);
    setPosition({ x: 50, y: 50 });
    setFileInputKey((key) => key + 1);
  }, []);

  useEffect(() => {
    if (!previewUrl) return;

    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        closePreview();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;

      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      URL.revokeObjectURL(previewUrl);
      if (previousFocus instanceof HTMLElement) previousFocus.focus();
    };
  }, [closePreview, previewUrl]);

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    setError(null);
    setSuccess(null);

    const value = event.currentTarget.files?.[0];
    if (!value) return;

    const invalid = validateProviderPhoto(value);
    if (invalid) {
      setError(invalid);
      event.currentTarget.value = "";
      return;
    }

    setSelectedFile(value);
    setPosition({ x: 50, y: 50 });
    setPreviewUrl(URL.createObjectURL(value));
  }

  async function confirmUpload() {
    if (!selectedFile) return;
    setError(null);
    busyRef.current = true;
    setBusy(true);

    const path = providerPhotoPath(userId, selectedFile);
    const supabase = createClient();
    let saved = false;

    try {
      const { error: uploadError } = await supabase.storage
        .from(PROVIDER_AVATARS_BUCKET)
        .upload(path, selectedFile, {
          cacheControl: "31536000",
          contentType: selectedFile.type,
          upsert: false,
        });

      if (uploadError) {
        setError(`Photo upload failed: ${uploadError.message}`);
        return;
      }

      const result = await uploadProviderAvatar(path, position);
      if (result.error) {
        setError(result.error);
        return;
      }

      setSuccess(result.success ?? "Profile photo saved.");
      saved = true;
    } catch {
      await supabase.storage.from(PROVIDER_AVATARS_BUCKET).remove([path]);
      setError("Could not save that photo. Please try again.");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }

    if (saved) closePreview();
  }

  return (
    <div className="flex gap-4">
      <div className="h-20 w-20 shrink-0 overflow-hidden rounded-full bg-sky">
        {imageUrl ? (
          // Public asset; a plain image avoids a stale optimized copy after replacement.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt="Your profile photo"
            className="h-full w-full object-cover"
            style={{ objectPosition: `${focalX}% ${focalY}%` }}
          />
        ) : (
          <div className="flex h-full items-center justify-center px-2 text-center text-xs font-semibold text-viridian/60">
            No photo yet
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1 space-y-3">
        <div>
          <Label htmlFor="provider-avatar">
            {imageUrl ? "Replace photo" : "Upload photo"}
          </Label>
          <Input
            key={fileInputKey}
            id="provider-avatar"
            name="image"
            type="file"
            accept={PROVIDER_PHOTO_ACCEPT}
            disabled={busy}
            onChange={handleFileChange}
            className="cursor-pointer file:mr-3 file:rounded-lg file:border-0 file:bg-honeydew file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-viridian"
          />
          <FieldHint>
            Choose a clear headshot, then position it in the profile preview.
            JPG, PNG, or WebP, up to 5 MB.
          </FieldHint>
        </div>
        {success ? (
          <span aria-live="polite" className="text-sm font-medium text-quad-700">
            {success}
          </span>
        ) : null}
        <FieldError>{previewUrl ? null : error}</FieldError>
      </div>

      {previewUrl
        ? createPortal(
            <div
              className="fixed inset-0 z-50 grid place-items-center bg-ink/75 p-4"
              onMouseDown={(event) => {
                if (event.target === event.currentTarget) closePreview();
              }}
            >
              <div
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="avatar-crop-title"
                aria-describedby="avatar-crop-description"
                tabIndex={-1}
                className="max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-2xl border border-line bg-paper p-5 shadow-[0_24px_80px_rgba(14,48,42,0.28)] outline-none sm:p-7"
              >
                <div className="text-center">
                  <h2
                    id="avatar-crop-title"
                    className="text-xl font-bold tracking-tight text-ink"
                  >
                    Position your profile photo
                  </h2>
                  <p
                    id="avatar-crop-description"
                    className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-ink-soft"
                  >
                    Drag the photo inside the circle. This is exactly what
                    customers will see.
                  </p>
                </div>

                <div className="my-6 grid place-items-center rounded-2xl bg-court px-4 py-7">
                  <PhotoRepositioner
                    imageUrl={previewUrl}
                    shape="circle"
                    focalX={position.x}
                    focalY={position.y}
                    onChange={(x, y) => setPosition({ x, y })}
                    alt="Profile photo crop preview"
                    className="h-[min(68vw,18rem)] w-[min(68vw,18rem)] border-4 border-paper shadow-[0_12px_36px_rgba(14,48,42,0.22)]"
                  />
                </div>

                <FieldError>{error}</FieldError>
                <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={busy}
                    onClick={closePreview}
                    className="w-full sm:w-auto"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    disabled={busy}
                    onClick={confirmUpload}
                    className="w-full sm:w-auto"
                  >
                    {busy ? "Saving photo..." : "Save photo"}
                  </Button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
