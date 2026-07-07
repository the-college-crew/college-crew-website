import type { ReactNode } from "react";

import type { OfferedService } from "@/lib/db/queries";
import { cn } from "@/lib/utils";

/**
 * Default banner art for provider cards: one colored segment per offered
 * service (capped at 3), each with a hand-drawn icon. Providers have no
 * uploaded imagery in the pilot, so every card gets this generated banner.
 * Purely decorative — the services are listed as text pills on the card.
 */

function ArtIcon({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-9"
      aria-hidden
    >
      {children}
    </svg>
  );
}

type BannerArt = { bg: string; icon: ReactNode };

/* Sparkle — generic fallback for slugs the map doesn't know. */
const FALLBACK_ART: BannerArt = {
  bg: "bg-crew-100",
  icon: (
    <ArtIcon>
      <path d="M12 4l1.7 4.8L18.5 10.5l-4.8 1.7L12 17l-1.7-4.8L5.5 10.5l4.8-1.7L12 4Z" />
      <path d="M18.5 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2Z" />
    </ArtIcon>
  ),
};

/* Keyed by services.slug. Admin-added slugs fall back to FALLBACK_ART. */
const SERVICE_ART: Record<string, BannerArt> = {
  "lawn-yard-care": {
    bg: "bg-honeydew",
    icon: (
      <ArtIcon>
        <path d="M6 19c0-4-1.5-6.5-3.5-7.5C6 11.5 8 13.5 8.5 16" />
        <path d="M12 19c0-6-1-9.5-3-12.5 3.5 2 5 5.5 5 8.5" />
        <path d="M18 19c0-4 1.5-6.5 3.5-7.5C18 11.5 16 13.5 15.5 16" />
        <path d="M3 19h18" />
      </ArtIcon>
    ),
  },
  "pet-care": {
    bg: "bg-sky",
    icon: (
      <ArtIcon>
        <circle cx="12" cy="15.5" r="3.5" />
        <circle cx="6.3" cy="10.5" r="1.7" />
        <circle cx="10.2" cy="7" r="1.7" />
        <circle cx="13.8" cy="7" r="1.7" />
        <circle cx="17.7" cy="10.5" r="1.7" />
      </ArtIcon>
    ),
  },
  tutoring: {
    bg: "bg-quad-50",
    icon: (
      <ArtIcon>
        <path d="M12 6.5C10 5 7.5 4.5 4 4.5v13.5c3.5 0 6 .5 8 2 2-1.5 4.5-2 8-2V4.5c-3.5 0-6 .5-8 2Z" />
        <path d="M12 6.5V20" />
      </ArtIcon>
    ),
  },
  hauling: {
    bg: "bg-stone",
    icon: (
      <ArtIcon>
        <path d="M21 8l-9-4-9 4v8l9 4 9-4V8Z" />
        <path d="M3 8l9 4 9-4" />
        <path d="M12 12v8" />
      </ArtIcon>
    ),
  },
  babysitting: {
    bg: "bg-gold-100",
    icon: (
      <ArtIcon>
        <path d="M12 20s-7-4.4-9-8.8C1.8 8.4 3.7 5.5 6.8 5.5c2 0 3.5 1.2 5.2 3.2 1.7-2 3.2-3.2 5.2-3.2 3.1 0 5 2.9 3.8 5.7-2 4.4-9 8.8-9 8.8Z" />
      </ArtIcon>
    ),
  },
  "pressure-washing": {
    bg: "bg-haze-200",
    icon: (
      <ArtIcon>
        <path d="M3 21l9-9" />
        <path d="M11 11l2.5 2.5" />
        <path d="M16.5 8.5l3.5-3.5" />
        <path d="M17.5 11.5l3.5-1" />
        <path d="M13.5 6.5l1-3.5" />
      </ArtIcon>
    ),
  },
  "window-washing": {
    bg: "bg-forest-100",
    icon: (
      <ArtIcon>
        <rect x="4" y="4" width="16" height="16" rx="1.5" />
        <path d="M12 4v16" />
        <path d="M4 12h16" />
      </ArtIcon>
    ),
  },
  // Removed from the catalog but admins can re-add it; cheap insurance.
  cleaning: FALLBACK_ART,
};

const MAX_SEGMENTS = 3;

export function ServiceBanner({ services }: { services: OfferedService[] }) {
  const slugs = [...new Set(services.map((offered) => offered.service.slug))];
  // Browse never lists service-less providers, but don't render a bare strip.
  const shown = slugs.length > 0 ? slugs.slice(0, MAX_SEGMENTS) : ["_fallback"];
  const extra = slugs.length - shown.length;

  return (
    <div aria-hidden className="relative flex h-24 w-full divide-x divide-paper/60">
      {shown.map((slug) => {
        const art = SERVICE_ART[slug] ?? FALLBACK_ART;
        return (
          <div
            key={slug}
            className={cn(
              "flex flex-1 items-center justify-center text-viridian",
              art.bg,
            )}
          >
            {art.icon}
          </div>
        );
      })}
      {extra > 0 ? (
        <span className="absolute bottom-2 right-3 rounded-full bg-viridian/80 px-2 py-0.5 text-[11px] font-semibold text-shell">
          +{extra} more
        </span>
      ) : null}
    </div>
  );
}
