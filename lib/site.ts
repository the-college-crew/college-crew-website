import { BASIS_POINTS_SCALE, PLATFORM_FEE_BPS } from "@/lib/booking/policy";

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

export { PLATFORM_FEE_BPS };

/**
 * Temporary compatibility for legacy pricing screens. New financial code must
 * use PLATFORM_FEE_BPS and integer arithmetic from lib/booking/policy.ts.
 */
export const PLATFORM_FEE_RATE = PLATFORM_FEE_BPS / BASIS_POINTS_SCALE;

export const TEAM = [
  { name: "Zach", role: "Co-founder — product & customers" },
  { name: "Ari", role: "Co-founder — providers & platform" },
  { name: "Max", role: "Co-founder — operations & legal" },
  { name: "Gianna", role: "Co-founder — marketing & community" },
] as const;
