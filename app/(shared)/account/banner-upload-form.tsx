"use client";

import { useActionState } from "react";

import { ProfileBanner } from "@/components/profile-banner";
import { Button } from "@/components/ui/button";
import { FieldError, FieldHint, Input, Label } from "@/components/ui/field";
import {
  BANNER_STYLES,
  type BannerStyle,
} from "@/lib/media/provider-banners";
import { cn } from "@/lib/utils";

import {
  removeProviderBanner,
  updateProviderBannerStyle,
  uploadProviderBanner,
  type ProviderSettingsFormState,
} from "./provider-actions";

const THEME_LABEL: Record<BannerStyle, string> = {
  forest: "Forest",
  varsity: "Varsity",
  pennant: "Pennant",
};

/**
 * Provider banner controls: pick one of three built-in themes and/or upload a
 * photo that overrides the theme. The chosen theme is remembered under any
 * photo, so removing the photo reverts to it.
 */
export function BannerUploadForm({
  imagePath,
  activeStyle,
}: {
  imagePath: string | null;
  activeStyle: BannerStyle;
}) {
  const [styleState, styleAction, savingStyle] = useActionState<
    ProviderSettingsFormState,
    FormData
  >(updateProviderBannerStyle, {});
  const [uploadState, uploadAction, uploading] = useActionState<
    ProviderSettingsFormState,
    FormData
  >(uploadProviderBanner, {});
  const [removeState, removeAction, removing] = useActionState<
    ProviderSettingsFormState,
    FormData
  >(removeProviderBanner, {});

  const hasPhoto = Boolean(imagePath);

  return (
    <div className="space-y-6">
      {/* Live preview of what neighbors see. */}
      <ProfileBanner
        imagePath={imagePath}
        style={activeStyle}
        className="h-28 rounded-xl border border-line"
      />

      {/* Theme picker — each swatch submits its choice. */}
      <div>
        <p className="text-sm font-semibold text-ink">Theme</p>
        <p className="mt-0.5 text-xs text-mist">
          Shown when you haven&apos;t uploaded a photo.
        </p>
        <form action={styleAction} className="mt-3">
          <div className="grid grid-cols-3 gap-3">
            {BANNER_STYLES.map((theme) => {
              const active = theme === activeStyle;
              return (
                <button
                  key={theme}
                  type="submit"
                  name="style"
                  value={theme}
                  disabled={savingStyle}
                  aria-pressed={active}
                  className={cn(
                    "group overflow-hidden rounded-xl border text-left transition-shadow focus-visible:outline-none",
                    active
                      ? "border-viridian ring-2 ring-viridian/30"
                      : "border-line hover:shadow-sm",
                  )}
                >
                  <ProfileBanner imagePath={null} style={theme} className="h-12" />
                  <span className="flex items-center justify-between px-2.5 py-1.5 text-xs font-semibold text-ink">
                    {THEME_LABEL[theme]}
                    {active ? (
                      <span aria-hidden className="text-viridian">
                        ✓
                      </span>
                    ) : null}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="mt-2 min-h-5">
            {styleState.success ? (
              <span className="text-sm font-medium text-quad-700">
                {styleState.success}
              </span>
            ) : null}
            <FieldError>{styleState.error}</FieldError>
          </div>
        </form>
      </div>

      {/* Photo upload — overrides the theme while set. */}
      <form action={uploadAction} className="space-y-3 border-t border-line pt-5">
        <div>
          <Label htmlFor="provider-banner">
            {hasPhoto ? "Replace banner photo" : "Upload a banner photo"}
          </Label>
          <Input
            id="provider-banner"
            name="image"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="cursor-pointer file:mr-3 file:rounded-lg file:border-0 file:bg-honeydew file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-viridian"
          />
          <FieldHint>
            A wide photo looks best — it spans the top of your Browse card and
            profile. JPG, PNG, or WebP, up to 5 MB.
          </FieldHint>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" size="sm" disabled={uploading || removing}>
            {uploading
              ? "Uploading…"
              : hasPhoto
                ? "Replace photo"
                : "Upload photo"}
          </Button>
          {uploadState.success ? (
            <span className="text-sm font-medium text-quad-700">
              {uploadState.success}
            </span>
          ) : null}
          <FieldError>{uploadState.error}</FieldError>
        </div>
      </form>

      {hasPhoto ? (
        <form action={removeAction}>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="submit"
              size="sm"
              variant="ghost"
              disabled={uploading || removing}
            >
              {removing ? "Removing…" : "Remove photo, use theme"}
            </Button>
            {removeState.success ? (
              <span className="text-sm font-medium text-quad-700">
                {removeState.success}
              </span>
            ) : null}
            <FieldError>{removeState.error}</FieldError>
          </div>
        </form>
      ) : null}
    </div>
  );
}
