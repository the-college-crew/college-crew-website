"use client";

import { ImagePlus, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { useBookingCopy } from "@/components/content/booking-copy-provider";
import { FieldError, FieldHint, Label } from "@/components/ui/field";
import {
  JOB_PHOTOS_BUCKET,
  JOB_PHOTO_EXTENSION_BY_MIME,
  JOB_PHOTO_MIME_TYPES,
  MAX_JOB_PHOTOS,
  MAX_JOB_PHOTO_BYTES,
  validateJobPhotoFiles,
  type JobPhoto,
} from "@/lib/media/job-photos";
import { createClient } from "@/lib/supabase/client";

type Slot = {
  /** Stable key; also the object URL revocation handle. */
  localId: string;
  previewUrl: string;
  fileName: string;
  status: "uploading" | "done" | "error";
  progress: number;
  photo?: JobPhoto;
  error?: string;
};

/**
 * Job-site photos for a quote request.
 *
 * Photos upload browser-direct as soon as they're picked: a Server Action can't
 * carry the bytes (Vercel rejects bodies over ~4.5 MB before the action runs,
 * invisibly), and uploading eagerly means submit is a small JSON post rather
 * than a long silent wait. The resulting manifest rides along in a hidden input.
 *
 * Paths are `<user_id>/<uuid>.<ext>` because the booking does not exist yet.
 */
export function JobPhotoPicker({
  userId,
  disabled,
  onChange,
}: {
  userId: string;
  disabled?: boolean;
  /** Fires with the uploaded manifest so the parent can gate submit. */
  onChange: (photos: JobPhoto[]) => void;
}) {
  const copy = useBookingCopy();
  const [slots, setSlots] = useState<Slot[]>([]);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null);

  function supabase() {
    supabaseRef.current ??= createClient();
    return supabaseRef.current;
  }

  const ready = slots
    .filter((slot): slot is Slot & { photo: JobPhoto } => Boolean(slot.photo))
    .map((slot) => slot.photo);

  // Object URLs are created per slot and must be released, or a customer who
  // swaps photos a few times leaks every preview they ever selected.
  useEffect(() => {
    return () => {
      setSlots((current) => {
        current.forEach((slot) => URL.revokeObjectURL(slot.previewUrl));
        return current;
      });
    };
  }, []);

  const emit = useCallback(
    (next: Slot[]) => {
      onChange(
        next
          .filter((slot): slot is Slot & { photo: JobPhoto } =>
            Boolean(slot.photo),
          )
          .map((slot) => slot.photo),
      );
    },
    [onChange],
  );

  async function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    const picked = Array.from(fileList);
    setError(null);

    const remaining = MAX_JOB_PHOTOS - slots.length;
    if (remaining <= 0) {
      setError(
        copy("booking-customer.request.photo-capacity-error", {
          max_photos: MAX_JOB_PHOTOS,
        }),
      );
      return;
    }
    // Validate the batch as if it were the whole set, so the per-file type and
    // size rules match what the Server Action and the RPC will enforce.
    const batch = picked.slice(0, remaining);
    const message = validateJobPhotoFiles(batch);
    if (message) {
      setError(message);
      return;
    }
    if (picked.length > remaining) {
      setError(
        copy("booking-customer.request.photo-truncated-error", {
          added_count: remaining,
          photo_word: remaining === 1 ? "photo" : "photos",
          max_photos: MAX_JOB_PHOTOS,
        }),
      );
    }

    const created: Slot[] = batch.map((file) => ({
      localId: crypto.randomUUID(),
      previewUrl: URL.createObjectURL(file),
      fileName: file.name,
      status: "uploading",
      progress: 0,
    }));
    setSlots((current) => [...current, ...created]);

    await Promise.all(
      batch.map(async (file, index) => {
        const slot = created[index];
        try {
          const photo = await uploadJobPhoto(supabase(), userId, file);
          setSlots((current) => {
            const next = current.map((item) =>
              item.localId === slot.localId
                ? { ...item, status: "done" as const, progress: 1, photo }
                : item,
            );
            emit(next);
            return next;
          });
        } catch (uploadError) {
          const reason =
            uploadError instanceof Error
              ? uploadError.message
              : copy("booking-customer.request.photo-generic-error");
          setSlots((current) =>
            current.map((item) =>
              item.localId === slot.localId
                ? { ...item, status: "error" as const, error: reason }
                : item,
            ),
          );
        }
      }),
    );

    if (inputRef.current) inputRef.current.value = "";
  }

  async function remove(localId: string) {
    const slot = slots.find((item) => item.localId === localId);
    if (!slot) return;

    setSlots((current) => {
      const next = current.filter((item) => item.localId !== localId);
      emit(next);
      return next;
    });
    URL.revokeObjectURL(slot.previewUrl);
    setError(null);

    // Best effort: the object is in the customer's own folder, and an orphan
    // there is harmless and unreachable by anyone else.
    if (slot.photo) {
      await supabase().storage.from(JOB_PHOTOS_BUCKET).remove([slot.photo.path]);
    }
  }

  const atCapacity = slots.length >= MAX_JOB_PHOTOS;

  return (
    <div>
      <Label htmlFor="jobPhotosInput">
        {copy("booking-customer.request.photo-label")}{" "}
        <span className="text-quad-700">
          {copy("booking-customer.request.photo-required")}
        </span>
      </Label>

      <input type="hidden" name="jobPhotos" value={JSON.stringify(ready)} />

      <ul className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
        {slots.map((slot) => (
          <li
            key={slot.localId}
            className="relative aspect-square overflow-hidden rounded-xl border border-line bg-court"
          >
            {/* Local object URL: next/image would proxy and cache a blob it
                cannot resolve on the server. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={slot.previewUrl}
              alt={slot.fileName}
              className="h-full w-full object-cover"
            />

            {slot.status === "uploading" ? (
              <div className="absolute inset-0 grid place-items-center bg-ink/45">
                <span className="animate-pulse text-xs font-medium text-white">
                  {copy("booking-customer.request.photo-uploading")}
                </span>
              </div>
            ) : null}

            {slot.status === "error" ? (
              <div className="absolute inset-0 grid place-items-center bg-ink/70 p-1">
                <span className="text-center text-[11px] font-medium leading-tight text-white">
                  {copy("booking-customer.request.photo-upload-failed")}
                </span>
              </div>
            ) : null}

            <button
              type="button"
              disabled={disabled}
              onClick={() => void remove(slot.localId)}
              aria-label={`Remove ${slot.fileName}`}
              className="absolute right-1 top-1 grid size-6 place-items-center rounded-full bg-ink/80 text-white transition hover:bg-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-400 active:scale-95 disabled:opacity-50"
            >
              <X aria-hidden className="size-3.5" strokeWidth={2.5} />
            </button>
          </li>
        ))}

        {atCapacity ? null : (
          <li className="aspect-square">
            <button
              type="button"
              disabled={disabled}
              onClick={() => inputRef.current?.click()}
              className="flex h-full w-full flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-line bg-court text-ink-soft transition hover:border-quad-700 hover:text-quad-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-400 active:scale-[0.98] disabled:opacity-50"
            >
              <ImagePlus aria-hidden className="size-5" strokeWidth={1.75} />
              <span className="text-xs font-medium">
                {slots.length === 0
                  ? copy("booking-customer.request.photo-add")
                  : copy("booking-customer.request.photo-add-more")}
              </span>
            </button>
          </li>
        )}
      </ul>

      <input
        ref={inputRef}
        id="jobPhotosInput"
        type="file"
        accept={JOB_PHOTO_MIME_TYPES.join(",")}
        multiple
        className="sr-only"
        disabled={disabled}
        onChange={(event) => void handleFiles(event.target.files)}
      />

      <FieldHint>
        {slots.length === 0
          ? copy("booking-customer.request.photo-empty-hint", {
              max_photos: MAX_JOB_PHOTOS,
              max_mb: MAX_JOB_PHOTO_BYTES / 1024 / 1024,
            })
          : copy("booking-customer.request.photo-ready-hint", {
              ready_count: ready.length,
              max_photos: MAX_JOB_PHOTOS,
            })}
      </FieldHint>

      <FieldError>{error}</FieldError>
    </div>
  );
}

type BrowserSupabaseClient = ReturnType<typeof createClient>;

/**
 * Standard upload, no resumable path: the bucket caps photos at 10 MB, which a
 * single PUT handles fine. (Chat reaches for tus because it also carries 50 MB
 * video.) The ~4.5 MB limit that matters elsewhere is Vercel's Server Action
 * body cap, which this request never touches.
 */
async function uploadJobPhoto(
  client: BrowserSupabaseClient,
  userId: string,
  file: File,
): Promise<JobPhoto> {
  const extension = JOB_PHOTO_EXTENSION_BY_MIME[file.type];
  if (!extension) throw new Error("Unsupported photo type.");

  const path = `${userId}/${crypto.randomUUID()}.${extension}`;
  const { error } = await client.storage
    .from(JOB_PHOTOS_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw new Error(error.message);

  return {
    path,
    kind: "image",
    mimeType: file.type,
    sizeBytes: file.size,
    name: file.name.slice(0, 160),
  };
}
