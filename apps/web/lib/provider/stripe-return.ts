export type StripeReturnSurface = "dashboard" | "account" | "onboarding";

const STRIPE_SURFACES: Record<
  StripeReturnSurface,
  { entryPath: string; refreshPath: string }
> = {
  dashboard: {
    entryPath: "/provider/dashboard",
    refreshPath: "/provider/dashboard?stripe=refresh",
  },
  account: {
    entryPath: "/account?tab=payouts",
    refreshPath: "/account?tab=payouts&stripe=refresh",
  },
  onboarding: {
    entryPath: "/provider/onboarding/stripe",
    refreshPath: "/provider/onboarding/stripe?stripe=refresh",
  },
};

export function parseStripeReturnSurface(
  value: string | null,
): StripeReturnSurface {
  return value === "account" || value === "onboarding" ? value : "dashboard";
}

export function getStripeSurfacePaths(surface: StripeReturnSurface) {
  return STRIPE_SURFACES[surface];
}

export function stripeSurfaceStatusPath(
  surface: StripeReturnSurface,
  status: string,
) {
  const url = new URL(
    STRIPE_SURFACES[surface].entryPath,
    "https://collegecrew.local",
  );
  url.searchParams.set("stripe", status);
  return `${url.pathname}${url.search}`;
}
