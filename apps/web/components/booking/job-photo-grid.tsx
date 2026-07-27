"use client";

import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { JOB_PHOTOS_BUCKET, type JobPhoto } from "@/lib/media/job-photos";
import { createClient } from "@/lib/supabase/client";

const VISIBLE_THUMBNAILS = 4;
const SIGNED_URL_TTL_SECONDS = 3600;

/**
 * Job-site photos attached to a quote request, shown on the provider's job card
 * and mirrored on the customer's own card.
 *
 * The bucket is private, so URLs are signed per viewer and expire in an hour.
 * Access is enforced in Postgres (`can_read_job_photo`) rather than here - a
 * provider who declined the request cannot mint a URL at all.
 */
export function JobPhotoGrid({
  photos,
  label = "Job site photos",
}: {
  photos: JobPhoto[];
  label?: string;
}) {
  const [urls, setUrls] = useState<Record<string, string> | null>(null);
  const [failed, setFailed] = useState(false);
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  useEffect(() => {
    if (photos.length === 0) return;
    let cancelled = false;

    createClient()
      .storage.from(JOB_PHOTOS_BUCKET)
      .createSignedUrls(
        photos.map((photo) => photo.path),
        SIGNED_URL_TTL_SECONDS,
      )
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error || !data) {
          setFailed(true);
          return;
        }
        const next: Record<string, string> = {};
        data.forEach((row) => {
          if (row.path && row.signedUrl) next[row.path] = row.signedUrl;
        });
        setUrls(next);
      });

    return () => {
      cancelled = true;
    };
  }, [photos]);

  if (photos.length === 0) return null;

  const visible = photos.slice(0, VISIBLE_THUMBNAILS);
  const overflow = photos.length - visible.length;

  return (
    <div className="mt-2">
      <p className="text-xs font-medium text-ink-soft">
        {label}
        <span className="ml-1 font-normal text-mist">({photos.length})</span>
      </p>

      {failed ? (
        <p className="mt-1 text-xs text-mist">
          These photos are no longer available to you.
        </p>
      ) : (
        <ul className="mt-1.5 flex gap-1.5">
          {visible.map((photo, index) => (
            <li key={photo.path}>
              <button
                type="button"
                onClick={() => setOpenIndex(index)}
                aria-label={`Open photo ${index + 1} of ${photos.length}`}
                className="relative block size-14 overflow-hidden rounded-lg border border-line bg-court transition hover:border-quad-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-400 active:scale-95"
              >
                <Thumbnail url={urls?.[photo.path]} name={photo.name} />
              </button>
            </li>
          ))}

          {overflow > 0 ? (
            <li>
              <button
                type="button"
                onClick={() => setOpenIndex(VISIBLE_THUMBNAILS)}
                aria-label={`Open the remaining ${overflow} photos`}
                className="size-14 rounded-lg border border-line bg-court text-xs font-semibold text-ink-soft transition hover:border-quad-700 hover:text-quad-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-400 active:scale-95"
              >
                +{overflow}
              </button>
            </li>
          ) : null}
        </ul>
      )}

      {openIndex === null ? null : (
        <JobPhotoLightbox
          photos={photos}
          urls={urls ?? {}}
          index={openIndex}
          onIndexChange={setOpenIndex}
          onClose={() => setOpenIndex(null)}
        />
      )}
    </div>
  );
}

function Thumbnail({ url, name }: { url?: string; name: string }) {
  if (!url) {
    return <span className="block size-full animate-pulse bg-line" />;
  }
  // Signed URLs are short-lived and per-viewer; next/image would proxy and
  // cache them, which both breaks on expiry and leaks past the access check.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt={name} className="size-full object-cover" />;
}

function JobPhotoLightbox({
  photos,
  urls,
  index,
  onIndexChange,
  onClose,
}: {
  photos: JobPhoto[];
  urls: Record<string, string>;
  index: number;
  onIndexChange: (next: number) => void;
  onClose: () => void;
}) {
  const step = useCallback(
    (delta: number) => {
      onIndexChange((index + delta + photos.length) % photos.length);
    },
    [index, photos.length, onIndexChange],
  );

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowRight") step(1);
      if (event.key === "ArrowLeft") step(-1);
    }
    document.addEventListener("keydown", onKeyDown);

    // Scrolling the dashboard behind a full-screen overlay is disorienting on
    // touch, where the overlay and the page both accept the same gesture.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose, step]);

  const photo = photos[index];
  const url = urls[photo.path];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Job site photo ${index + 1} of ${photos.length}`}
      className="fixed inset-0 z-50 flex flex-col bg-ink/90 p-4"
      onClick={onClose}
    >
      <div className="flex justify-end">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close photo viewer"
          className="grid size-10 place-items-center rounded-full bg-white/10 text-white transition hover:bg-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-400 active:scale-95"
        >
          <X aria-hidden className="size-5" />
        </button>
      </div>

      <div
        className="flex min-h-0 flex-1 items-center justify-center gap-2"
        onClick={(event) => event.stopPropagation()}
      >
        {photos.length > 1 ? (
          <LightboxNav label="Previous photo" onClick={() => step(-1)}>
            <ChevronLeft aria-hidden className="size-5" />
          </LightboxNav>
        ) : null}

        {url ? (
          // Same reasoning as the thumbnail: signed, expiring, per-viewer.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt={photo.name}
            className="max-h-full min-h-0 max-w-full rounded-xl object-contain"
          />
        ) : (
          <div className="size-64 animate-pulse rounded-xl bg-white/10" />
        )}

        {photos.length > 1 ? (
          <LightboxNav label="Next photo" onClick={() => step(1)}>
            <ChevronRight aria-hidden className="size-5" />
          </LightboxNav>
        ) : null}
      </div>

      <p className="pt-3 text-center text-xs text-white/70">
        {index + 1} of {photos.length}
      </p>
    </div>
  );
}

function LightboxNav({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="grid size-10 shrink-0 place-items-center rounded-full bg-white/10 text-white transition hover:bg-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-400 active:scale-95"
    >
      {children}
    </button>
  );
}
