"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FieldError } from "@/components/ui/field";
import {
  BLOG_IMAGE_ACCEPT,
  blogImageUrl,
  validateBlogImage,
} from "@/lib/media/blog-images";

import { uploadBlogImage } from "./actions";

export type BlogPhoto = { key: string; url: string };

/**
 * The key is the whole product of this page — it is what gets pasted into the
 * Slack canvas — so copying it is one tap and never a manual selection.
 */
function CopyKeyButton({
  photoKey,
  size = "sm",
}: {
  photoKey: string;
  size?: "sm" | "md";
}) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(photoKey);
      setFailed(false);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access needs a secure context; say so rather than looking
      // like nothing happened.
      setFailed(true);
    }
  }

  return (
    <div>
      <Button
        variant={copied ? "success" : "secondary"}
        size={size}
        onClick={copy}
      >
        {copied ? "Copied" : "Copy for the canvas"}
      </Button>
      {failed ? <FieldError>Copy that key by hand — the clipboard is blocked here.</FieldError> : null}
    </div>
  );
}

function Thumbnail({ photo }: { photo: BlogPhoto }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={photo.url}
      alt=""
      loading="lazy"
      className="size-full object-cover"
    />
  );
}

export function BlogPhotoManager({ photos }: { photos: BlogPhoto[] }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploaded, setUploaded] = useState<{
    key: string;
    url: string | null;
  } | null>(null);
  const [pending, startTransition] = useTransition();

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    setError(null);

    const file = event.currentTarget.files?.[0];
    if (!file) return;

    const invalid = validateBlogImage(file);
    if (invalid) {
      setError(invalid);
      event.currentTarget.value = "";
      return;
    }

    const formData = new FormData();
    formData.append("photo", file);
    if (inputRef.current) inputRef.current.value = "";

    startTransition(async () => {
      const result = await uploadBlogImage(formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      // Preview from the real public URL rather than a local blob: if it
      // renders, the object is genuinely readable at the address the blog will
      // use. The action revalidates, but refresh so the grid updates too.
      setUploaded({ key: result.key, url: blogImageUrl(result.key) });
      router.refresh();
    });
  }

  const earlier = uploaded
    ? photos.filter((photo) => photo.key !== uploaded.key)
    : photos;

  return (
    <div className="space-y-6">
      <Card className="p-5">
        <label
          className={`flex cursor-pointer flex-col items-center gap-1.5 rounded-2xl border border-dashed border-viridian/35 bg-paper/70 px-6 py-10 text-center transition hover:bg-stone/30 ${
            pending ? "pointer-events-none opacity-60" : ""
          }`}
        >
          <span className="font-display text-lg font-semibold text-viridian">
            {pending ? "Uploading…" : "Choose a photo"}
          </span>
          <span className="text-xs text-mist">
            JPG, PNG, or WebP · up to 5 MB
          </span>
          <input
            ref={inputRef}
            type="file"
            accept={BLOG_IMAGE_ACCEPT}
            className="sr-only"
            disabled={pending}
            onChange={handleFileChange}
          />
        </label>
        <FieldError>{error}</FieldError>
      </Card>

      {uploaded ? (
        <Card pennant className="p-5">
          <h2 className="font-display text-lg font-semibold text-viridian">
            Uploaded
          </h2>
          <div className="mt-4 flex flex-wrap items-center gap-4">
            {uploaded.url ? (
              <div className="size-24 shrink-0 overflow-hidden rounded-xl border border-stone">
                <Thumbnail photo={{ key: uploaded.key, url: uploaded.url }} />
              </div>
            ) : null}
            <div className="min-w-0 space-y-2">
              <p className="break-all font-mono text-sm text-ink">
                {uploaded.key}
              </p>
              <CopyKeyButton photoKey={uploaded.key} size="md" />
            </div>
          </div>
          <p className="mt-4 text-sm leading-relaxed text-ink-soft">
            Paste that key into the <strong>Image</strong> line of the blog
            canvas in Slack, then tick the approval box. The post goes live on
            the next Monday run.
          </p>
        </Card>
      ) : null}

      <div>
        <h2 className="font-display text-lg font-semibold text-viridian">
          Earlier photos
        </h2>
        {earlier.length === 0 ? (
          <p className="mt-2 text-sm text-ink-soft">
            Nothing uploaded yet. The first photo you add shows up here.
          </p>
        ) : (
          <ul className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {earlier.map((photo) => (
              <li key={photo.key} className="space-y-2">
                <div className="aspect-[4/3] overflow-hidden rounded-xl border border-stone">
                  <Thumbnail photo={photo} />
                </div>
                <p className="break-all font-mono text-[11px] leading-snug text-mist">
                  {photo.key}
                </p>
                <CopyKeyButton photoKey={photo.key} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
