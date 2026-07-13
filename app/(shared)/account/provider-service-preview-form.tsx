"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { FieldError, FieldHint, Input, Label } from "@/components/ui/field";

import {
  removeProviderServicePreview,
  uploadProviderServicePreview,
  type ProviderSettingsFormState,
} from "./provider-actions";

export type ProviderServicePreview = {
  id: string;
  serviceName: string;
  imageUrl: string | null;
};

/** One independent upload form per offered service. */
function ServicePreviewCard({ preview }: { preview: ProviderServicePreview }) {
  const [uploadState, uploadAction, uploading] = useActionState<
    ProviderSettingsFormState,
    FormData
  >(uploadProviderServicePreview, {});
  const [removeState, removeAction, removing] = useActionState<
    ProviderSettingsFormState,
    FormData
  >(removeProviderServicePreview, {});

  return (
    <li className="overflow-hidden rounded-xl border border-line bg-paper">
      <div className="flex gap-4 p-4">
        <div className="h-20 w-28 shrink-0 overflow-hidden rounded-lg bg-sky">
          {preview.imageUrl ? (
            // Public storefront asset; a plain image avoids cached optimizer
            // copies after the provider replaces it with a new object URL.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={preview.imageUrl}
              alt={`${preview.serviceName} service preview`}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full items-center justify-center px-3 text-center text-xs font-semibold text-viridian/60">
              No photo yet
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-ink">{preview.serviceName}</h3>
          <p className="mt-1 text-xs leading-relaxed text-mist">
            This photo appears in your Browse banner and public profile.
          </p>
        </div>
      </div>

      <div className="border-t border-line bg-court p-4">
        <form action={uploadAction} className="space-y-3">
          <input type="hidden" name="providerServiceId" value={preview.id} />
          <div>
            <Label htmlFor={`service-preview-${preview.id}`}>
              {preview.imageUrl ? "Replace photo" : "Upload photo"}
            </Label>
            <Input
              id={`service-preview-${preview.id}`}
              name="image"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="cursor-pointer file:mr-3 file:rounded-lg file:border-0 file:bg-honeydew file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-viridian"
            />
            <FieldHint>JPG, PNG, or WebP — up to 5 MB.</FieldHint>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" size="sm" disabled={uploading || removing}>
              {uploading ? "Uploading…" : preview.imageUrl ? "Replace photo" : "Upload photo"}
            </Button>
            {uploadState.success ? (
              <span className="text-sm font-medium text-quad-700">
                {uploadState.success}
              </span>
            ) : null}
            <FieldError>{uploadState.error}</FieldError>
          </div>
        </form>

        {preview.imageUrl ? (
          <form action={removeAction} className="mt-3">
            <input type="hidden" name="providerServiceId" value={preview.id} />
            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" size="sm" variant="ghost" disabled={uploading || removing}>
                {removing ? "Removing…" : "Remove photo"}
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
    </li>
  );
}

export function ProviderServicePreviewForm({
  previews,
}: {
  previews: ProviderServicePreview[];
}) {
  if (previews.length === 0) {
    return (
      <p className="text-sm text-ink-soft">
        Add a service and price first, then you can upload its preview photo.
      </p>
    );
  }

  return <ul className="space-y-4">{previews.map((preview) => <ServicePreviewCard key={preview.id} preview={preview} />)}</ul>;
}
