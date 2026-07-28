"use client";

import { useEffect, useState } from "react";

import {
  createAdminProviderAvatarUpload,
  saveAdminProviderAvatar,
} from "@/app/(admin)/admin/actions";
import { PhotoRepositioner } from "@/components/photo-repositioner";
import { Button } from "@/components/ui/button";
import { FieldError, FieldHint, Input, Label } from "@/components/ui/field";
import {
  PROVIDER_AVATARS_BUCKET,
  providerAvatarUrl,
} from "@/lib/media/provider-avatars";
import {
  PROVIDER_PHOTO_ACCEPT,
  validateProviderPhoto,
} from "@/lib/media/provider-photos";
import { createClient } from "@/lib/supabase/client";

export function AdminAvatarCropEditor({
  providerId,
  imagePath,
  focalX,
  focalY,
}: {
  providerId: string;
  imagePath: string | null;
  focalX: number;
  focalY: number;
}) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [currentPath, setCurrentPath] = useState(imagePath);
  const [savedPosition, setSavedPosition] = useState({ x: focalX, y: focalY });
  const [position, setPosition] = useState({ x: focalX, y: focalY });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [fileInputKey, setFileInputKey] = useState(0);

  useEffect(() => {
    if (!previewUrl) return;
    return () => URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const currentUrl = providerAvatarUrl(currentPath);
  const cropUrl = previewUrl ?? currentUrl;

  function beginEditing() {
    setError(null);
    setSuccess(null);
    setPosition(savedPosition);
    setEditing(true);
  }

  function cancelEditing() {
    if (busy) return;
    setEditing(false);
    setError(null);
    setSelectedFile(null);
    setPreviewUrl(null);
    setPosition(savedPosition);
    setFileInputKey((key) => key + 1);
  }

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    setError(null);
    setSuccess(null);

    const file = event.currentTarget.files?.[0];
    if (!file) return;
    setSelectedFile(null);
    setPreviewUrl(null);
    setPosition(savedPosition);

    const invalid = validateProviderPhoto(file);
    if (invalid) {
      setError(invalid);
      event.currentTarget.value = "";
      return;
    }

    setSelectedFile(file);
    setPosition({ x: 50, y: 50 });
    setPreviewUrl(URL.createObjectURL(file));
  }

  async function savePhoto() {
    if (!cropUrl) {
      setError("Choose a profile photo first.");
      return;
    }

    setBusy(true);
    setError(null);
    let replacementPath = "";

    try {
      if (selectedFile) {
        const uploadForm = new FormData();
        uploadForm.set("providerId", providerId);
        uploadForm.set("contentType", selectedFile.type);
        const uploadRequest = await createAdminProviderAvatarUpload(uploadForm);
        if (!uploadRequest.ok) {
          setError(uploadRequest.error);
          return;
        }

        replacementPath = uploadRequest.path;
        const { error: uploadError } = await createClient()
          .storage.from(PROVIDER_AVATARS_BUCKET)
          .uploadToSignedUrl(
            uploadRequest.path,
            uploadRequest.token,
            selectedFile,
            {
              cacheControl: "31536000",
              contentType: selectedFile.type,
            },
          );
        if (uploadError) {
          setError(`Photo upload failed: ${uploadError.message}`);
          return;
        }
      }

      const saveForm = new FormData();
      saveForm.set("providerId", providerId);
      saveForm.set("path", replacementPath);
      saveForm.set("x", String(position.x));
      saveForm.set("y", String(position.y));
      const result = await saveAdminProviderAvatar(saveForm);
      if (!result.ok) {
        setError(result.error);
        return;
      }

      const nextPosition = { x: result.x, y: result.y };
      setCurrentPath(result.path);
      setSavedPosition(nextPosition);
      setPosition(nextPosition);
      setSelectedFile(null);
      setPreviewUrl(null);
      setFileInputKey((key) => key + 1);
      setEditing(false);
      setSuccess("Profile photo updated.");
    } catch {
      setError("Could not update that profile photo. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="sm:col-span-2">
      <dt className="text-mist">Profile photo</dt>
      <dd className="mt-1 font-medium">
        {!editing ? (
          <div className="flex flex-wrap items-center gap-3">
            {currentUrl ? (
              // Public asset; using the direct URL avoids a stale optimized copy.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={currentUrl}
                alt="Provider profile photo"
                className="h-14 w-14 rounded-full object-cover"
                style={{
                  objectPosition: `${savedPosition.x}% ${savedPosition.y}%`,
                }}
              />
            ) : (
              <div className="grid h-14 w-14 place-items-center rounded-full bg-sky px-2 text-center text-[10px] font-semibold leading-tight text-viridian/60">
                No photo
              </div>
            )}
            <Button type="button" size="sm" variant="secondary" onClick={beginEditing}>
              {currentUrl ? "Edit photo" : "Upload photo"}
            </Button>
          </div>
        ) : (
          <div className="mt-2 rounded-2xl border border-line bg-paper p-4 sm:p-5">
            <div className="grid gap-5 sm:grid-cols-[12rem_1fr] sm:items-center">
              <div className="grid place-items-center rounded-2xl bg-court px-3 py-5">
                {cropUrl ? (
                  <PhotoRepositioner
                    imageUrl={cropUrl}
                    shape="circle"
                    focalX={position.x}
                    focalY={position.y}
                    onChange={(x, y) => setPosition({ x, y })}
                    alt="Provider profile photo crop preview"
                    className="h-40 w-40 border-4 border-paper shadow-[0_10px_30px_rgba(14,48,42,0.18)]"
                  />
                ) : (
                  <div className="grid h-40 w-40 place-items-center rounded-full border-4 border-paper bg-sky px-6 text-center text-xs font-semibold text-viridian/60">
                    Choose a photo to preview
                  </div>
                )}
              </div>

              <div>
                <p className="text-sm font-semibold text-ink">
                  Position the customer-facing crop
                </p>
                <p className="mt-1 text-xs leading-relaxed text-ink-soft">
                  Drag inside the circle, or choose a replacement photo first.
                </p>
                <div className="mt-4">
                  <Label htmlFor={`admin-avatar-${providerId}`}>
                    {currentUrl ? "Replace photo" : "Choose photo"}
                  </Label>
                  <Input
                    key={fileInputKey}
                    id={`admin-avatar-${providerId}`}
                    type="file"
                    accept={PROVIDER_PHOTO_ACCEPT}
                    disabled={busy}
                    onChange={handleFileChange}
                    className="cursor-pointer file:mr-3 file:rounded-lg file:border-0 file:bg-honeydew file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-viridian"
                  />
                  <FieldHint>JPG, PNG, or WebP, up to 5 MB.</FieldHint>
                </div>
              </div>
            </div>

            <FieldError>{error}</FieldError>
            <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={busy}
                onClick={cancelEditing}
                className="w-full sm:w-auto"
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={busy || !cropUrl}
                onClick={savePhoto}
                className="w-full sm:w-auto"
              >
                {busy ? "Saving photo..." : "Save photo"}
              </Button>
            </div>
          </div>
        )}

        {success ? (
          <p aria-live="polite" className="mt-2 text-xs font-medium text-quad-700">
            {success}
          </p>
        ) : null}
        {!editing ? <FieldError>{error}</FieldError> : null}
      </dd>
    </div>
  );
}
