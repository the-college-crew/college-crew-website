import { describe, expect, it } from "vitest";

import {
  getStripeSurfacePaths,
  parseStripeReturnSurface,
  stripeSurfaceStatusPath,
} from "./stripe-return";

describe("Stripe onboarding return surfaces", () => {
  it("keeps each entry point on its own return and refresh path", () => {
    expect(getStripeSurfacePaths("dashboard")).toEqual({
      entryPath: "/provider/dashboard",
      refreshPath: "/provider/dashboard?stripe=refresh",
    });
    expect(getStripeSurfacePaths("account")).toEqual({
      entryPath: "/account?tab=payouts",
      refreshPath: "/account?tab=payouts&stripe=refresh",
    });
    expect(getStripeSurfacePaths("onboarding")).toEqual({
      entryPath: "/provider/onboarding/stripe",
      refreshPath: "/provider/onboarding/stripe?stripe=refresh",
    });
  });

  it("defaults unknown or missing return flows to the dashboard", () => {
    expect(parseStripeReturnSurface("account")).toBe("account");
    expect(parseStripeReturnSurface("onboarding")).toBe("onboarding");
    expect(parseStripeReturnSurface("unexpected")).toBe("dashboard");
    expect(parseStripeReturnSurface(null)).toBe("dashboard");
  });

  it("preserves account query state when adding a Stripe status", () => {
    expect(stripeSurfaceStatusPath("account", "connected")).toBe(
      "/account?tab=payouts&stripe=connected",
    );
  });
});
