"use client";

import { useRef, useState } from "react";

import { cn } from "@/lib/utils";

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

/**
 * Lets a provider drag their photo around inside its fixed frame to pick a
 * focal point, applied via CSS object-position wherever the photo renders.
 * Not a crop tool -- the full image is always kept, just repositioned.
 *
 * Drag range per axis is however far object-fit: cover overflows the frame
 * on that axis; an axis with zero overflow (image and frame share that
 * dimension's aspect) simply isn't draggable, which is expected.
 */
export function PhotoRepositioner({
  imageUrl,
  shape,
  focalX,
  focalY,
  onChange,
  className,
  alt = "",
}: {
  imageUrl: string;
  shape: "circle" | "banner";
  focalX: number;
  focalY: number;
  onChange: (x: number, y: number) => void;
  className?: string;
  alt?: string;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [loaded, setLoaded] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const dragState = useRef<{
    lastX: number;
    lastY: number;
    overflowX: number;
    overflowY: number;
    focalX: number;
    focalY: number;
  } | null>(null);

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    const frame = frameRef.current;
    const img = imgRef.current;
    if (!loaded || !frame || !img) return;

    const frameRect = frame.getBoundingClientRect();
    const scale = Math.max(
      frameRect.width / img.naturalWidth,
      frameRect.height / img.naturalHeight,
    );
    const displayedWidth = img.naturalWidth * scale;
    const displayedHeight = img.naturalHeight * scale;

    dragState.current = {
      lastX: event.clientX,
      lastY: event.clientY,
      overflowX: displayedWidth - frameRect.width,
      overflowY: displayedHeight - frameRect.height,
      focalX,
      focalY,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    setIsDragging(true);
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const drag = dragState.current;
    if (!drag) return;

    const dx = event.clientX - drag.lastX;
    const dy = event.clientY - drag.lastY;

    const newFocalX =
      drag.overflowX > 0
        ? clamp(drag.focalX - (dx / drag.overflowX) * 100, 0, 100)
        : drag.focalX;
    const newFocalY =
      drag.overflowY > 0
        ? clamp(drag.focalY - (dy / drag.overflowY) * 100, 0, 100)
        : drag.focalY;

    drag.lastX = event.clientX;
    drag.lastY = event.clientY;
    drag.focalX = newFocalX;
    drag.focalY = newFocalY;
    onChange(newFocalX, newFocalY);
  }

  function endDrag() {
    dragState.current = null;
    setIsDragging(false);
  }

  return (
    <div
      ref={frameRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      className={cn(
        "touch-none select-none overflow-hidden",
        shape === "circle" ? "rounded-full" : undefined,
        isDragging ? "cursor-grabbing" : "cursor-grab",
        className,
      )}
    >
      {/* Public asset; a plain image avoids cached optimizer copies after the
          provider replaces it with a new object URL. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={imgRef}
        src={imageUrl}
        alt={alt}
        draggable={false}
        onDragStart={(event) => event.preventDefault()}
        onLoad={() => setLoaded(true)}
        className="h-full w-full object-cover"
        style={{ objectPosition: `${focalX}% ${focalY}%` }}
      />
    </div>
  );
}
