/**
 * Site-wide configuration. Rebranding or relocating the pilot is a change
 * here, not a find-and-replace across the app.
 */

export const SITE = {
  name: "College Crew",
  tagline: "Neighbors hiring verified college students, right down the street.",
  description:
    "College Crew is a curated, hyperlocal marketplace connecting neighbors with verified student providers (18+) for everyday home and household services.",
} as const;

// Placeholder until the launch neighborhood is chosen (pilot is one
// neighborhood only — SPEC §2).
export const NEIGHBORHOOD = {
  name: "Maple Heights",
  isPlaceholder: true,
} as const;

// Locked decision (SPEC §3): 15% take rate, charged to the provider.
export const PLATFORM_FEE_RATE = 0.15;

export const TEAM = [
  { name: "Zach", role: "Co-founder — product & customers" },
  { name: "Ari", role: "Co-founder — providers & platform" },
  { name: "Max", role: "Co-founder — operations & legal" },
  { name: "Gianna", role: "Co-founder — marketing & community" },
] as const;
