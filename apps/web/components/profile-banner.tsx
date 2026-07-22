import type { CSSProperties } from "react";

import {
  providerBannerUrl,
  toBannerStyle,
  type BannerStyle,
} from "@/lib/media/provider-banners";
import { cn } from "@/lib/utils";

/**
 * Provider-card / profile banner: one wide image behind the round headshot.
 * A provider's uploaded photo takes over when present; otherwise one of three
 * built-in CSS themes renders (their pick, remembered under any uploaded photo).
 * Decorative — the provider's name and services are always text nearby.
 *
 * Themes are pure CSS so they carry no network cost and read crisply at any
 * height. All colors come from the brand palette (globals.css @theme).
 */
const THEME_BACKGROUND: Record<BannerStyle, CSSProperties> = {
  // Deep forest field with a soft top-left light — the paper-bordered avatar
  // pops against it. The quietest option.
  forest: {
    background:
      "radial-gradient(120% 140% at 12% 0%, rgba(89,107,102,0.5), transparent 58%), linear-gradient(135deg, #22312e 0%, #344945 62%, #2b3a37 100%)",
  },
  // Collegiate varsity: faint gold diagonals over forest, echoing a rep tie.
  varsity: {
    background:
      "repeating-linear-gradient(45deg, rgba(197,194,125,0.17) 0 12px, transparent 12px 44px), linear-gradient(135deg, #2b3a37 0%, #3a4f4a 100%)",
  },
  // Airy pennant wash: honeydew → sky, the pennant stripe's tri-tone spread wide.
  pennant: {
    background:
      "linear-gradient(115deg, #e4e3bc 0%, #eef1e0 38%, #d9e5e6 68%, #d5e3e8 100%)",
  },
};

export function ProfileBanner({
  imagePath,
  style,
  focalX,
  focalY,
  className,
}: {
  imagePath: string | null | undefined;
  style: string | null | undefined;
  focalX?: number | null;
  focalY?: number | null;
  className?: string;
}) {
  const imageUrl = providerBannerUrl(imagePath);
  const theme = toBannerStyle(style);

  return (
    <div
      aria-hidden
      className={cn("relative w-full overflow-hidden", className)}
      style={imageUrl ? undefined : THEME_BACKGROUND[theme]}
    >
      {imageUrl ? (
        // User-uploaded banner from our public Storage bucket. `img` avoids
        // Next's remote optimizer caching a stale replacement at its old URL.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageUrl}
          alt=""
          className="h-full w-full object-cover"
          style={{ objectPosition: `${focalX ?? 50}% ${focalY ?? 50}%` }}
        />
      ) : null}
    </div>
  );
}
