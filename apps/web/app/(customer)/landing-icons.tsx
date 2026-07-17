/**
 * Hand-drawn line icons for the landing page's service and feature cards.
 * One stroke weight (1.8), round caps, 24px grid, currentColor — kept in-repo
 * so the set stays on-brand instead of pulling in an icon library.
 */

function Icon({
  children,
  className = "h-6 w-6",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

/* ---------------------------------- Services --------------------------- */

const SERVICE_GLYPHS: Record<string, React.ReactNode> = {
  // Paw print
  "pet-care": (
    <>
      <circle cx="5.4" cy="10" r="1.6" />
      <circle cx="9.6" cy="6.9" r="1.7" />
      <circle cx="14.4" cy="6.9" r="1.7" />
      <circle cx="18.6" cy="10" r="1.6" />
      <path d="M12 11.2c-2.5 0-4.7 1.8-5.3 4.3-.3 1.4.8 2.6 2.2 2.6h6.2c1.4 0 2.5-1.2 2.2-2.6-.6-2.5-2.8-4.3-5.3-4.3Z" />
    </>
  ),
  // Sprouting grass
  "lawn-yard-care": (
    <>
      <path d="M12 19.5v-6.3" />
      <path d="M12 13.2c0-3.6 2.5-6.2 6.2-6.2 0 3.6-2.5 6.2-6.2 6.2Z" />
      <path d="M12 15.4c0-2.9-2-4.9-4.9-4.9 0 2.9 2 4.9 4.9 4.9Z" />
      <path d="M4.5 19.5h15" />
    </>
  ),
  // House with a check
  "house-management": (
    <>
      <path d="M4 11l8-6.8L20 11" />
      <path d="M6.2 9.2v10h11.6v-10" />
      <path d="M9.4 14.4l2 2 3.4-3.6" />
    </>
  ),
  // Open book
  tutoring: (
    <>
      <path d="M12 6.6C10.5 5.1 8.4 4.6 4.2 4.6v13.6c4.2 0 6.3.5 7.8 2 1.5-1.5 3.6-2 7.8-2V4.6c-4.2 0-6.3.5-7.8 2Z" />
      <path d="M12 6.6v13.6" />
    </>
  ),
  // Basketball — mirrored seams so it doesn't read as a globe
  "youth-sports-coaching": (
    <>
      <circle cx="12" cy="12" r="7.6" />
      <path d="M12 4.4c2.6 2.2 2.6 13 0 15.2" />
      <path d="M12 4.4c-2.6 2.2-2.6 13 0 15.2" />
      <path d="M4.4 12h15.2" />
    </>
  ),
  // Moving box
  hauling: (
    <>
      <path d="M4.2 8.2 12 4.4l7.8 3.8L12 12 4.2 8.2Z" />
      <path d="M4.2 8.2v7.6L12 19.6l7.8-3.8V8.2" />
      <path d="M12 12v7.6" />
    </>
  ),
  // Water droplet with spray
  "pressure-washing": (
    <>
      <path d="M12 5.2S7.4 10.5 7.4 13.6a4.6 4.6 0 0 0 9.2 0c0-3.1-4.6-8.4-4.6-8.4Z" />
      <path d="M4.4 6.6l1.9 1.4" />
      <path d="M19.6 6.6l-1.9 1.4" />
    </>
  ),
  // Window panes
  "window-washing": (
    <>
      <rect x="5" y="4.6" width="14" height="14.8" rx="1.5" />
      <path d="M12 4.6v14.8" />
      <path d="M5 12h14" />
    </>
  ),
  // Heart
  babysitting: (
    <>
      <path d="M12 19.4s-7-4.3-7-8.9a4 4 0 0 1 7-2.6 4 4 0 0 1 7 2.6c0 4.6-7 8.9-7 8.9Z" />
    </>
  ),
};

// Spark — for services added to the catalog before an icon is drawn.
const SERVICE_FALLBACK = (
  <>
    <path d="M12 5v14" />
    <path d="M5.9 8.5l12.2 7" />
    <path d="M18.1 8.5l-12.2 7" />
  </>
);

export function ServiceIcon({
  slug,
  className,
}: {
  slug: string;
  className?: string;
}) {
  return (
    <Icon className={className}>{SERVICE_GLYPHS[slug] ?? SERVICE_FALLBACK}</Icon>
  );
}

/* ---------------------------------- Features --------------------------- */

/** Ordered to match the FEATURES list on the landing page. */
const FEATURE_GLYPHS: React.ReactNode[] = [
  // Verified college students — ID card
  <>
    <rect x="3.5" y="5.8" width="17" height="12.8" rx="2" />
    <circle cx="8.8" cy="11" r="1.8" />
    <path d="M6.1 15.8c.5-1.4 1.5-2.1 2.7-2.1s2.2.7 2.7 2.1" />
    <path d="M14.2 10.4h3.8" />
    <path d="M14.2 13.8h2.8" />
  </>,
  // Secure in-app payments — padlock
  <>
    <rect x="5.6" y="10.4" width="12.8" height="9" rx="2" />
    <path d="M8.6 10.4V8a3.4 3.4 0 0 1 6.8 0v2.4" />
    <path d="M12 13.9v2" />
  </>,
  // A reputation that travels — star with motion trail
  <>
    <path d="M13.4 4.8l1.9 3.8 4.2.6-3 3 .7 4.2-3.8-2-3.7 2 .7-4.2-3.1-3 4.2-.6 1.9-3.8Z" />
    <path d="M3 9.4h2.6" />
    <path d="M2.4 13h2.2" />
  </>,
  // Neighbors, not strangers — map pin
  <>
    <path d="M12 20.2s6.4-5.5 6.4-9.9a6.4 6.4 0 1 0-12.8 0c0 4.4 6.4 9.9 6.4 9.9Z" />
    <circle cx="12" cy="10.2" r="2.2" />
  </>,
  // ID & school checks — grad cap
  <>
    <path d="M3 9.4 12 5l9 4.4-9 4.4L3 9.4Z" />
    <path d="M7 11.6v3.6c0 1.2 2.2 2.6 5 2.6s5-1.4 5-2.6v-3.6" />
    <path d="M21 9.4v4.2" />
  </>,
  // Guarantee & support — award ribbon with check
  <>
    <circle cx="12" cy="9.4" r="4.9" />
    <path d="M9.6 13.6 8.2 19.6l3.8-1.9 3.8 1.9-1.4-6" />
    <path d="M10.2 9.3l1.3 1.3 2.4-2.5" />
  </>,
];

export function FeatureIcon({
  index,
  className,
}: {
  index: number;
  className?: string;
}) {
  return (
    <Icon className={className}>
      {FEATURE_GLYPHS[index] ?? SERVICE_FALLBACK}
    </Icon>
  );
}
