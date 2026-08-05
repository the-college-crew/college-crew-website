import { describe, expect, it } from "vitest";

import {
  needsProfileCompletion,
  profileCompletionPath,
  safeNext,
} from "./redirects";

describe("auth redirects", () => {
  it.each([null, undefined, "", "https://example.com", "//example.com", "/\\example.com"])(
    "rejects a non-local next destination: %s",
    (next) => {
      expect(safeNext(next)).toBe("/");
    },
  );

  it("preserves a local path, query, and hash", () => {
    expect(safeNext("/book/provider-id?service=yard#time")).toBe(
      "/book/provider-id?service=yard#time",
    );
  });

  it("encodes the destination in the profile-completion route", () => {
    expect(profileCompletionPath("/provider/onboarding/account")).toBe(
      "/complete-profile?next=%2Fprovider%2Fonboarding%2Faccount",
    );
  });
});

describe("profile completion", () => {
  const completeProfile = {
    full_name: "Jordan Rivera",
    address_line1: "1724 Maple Ave",
    city: "Evanston",
    state: "IL",
    postal_code: "60201",
  };

  it("accepts a profile with every required field", () => {
    expect(needsProfileCompletion(completeProfile)).toBe(false);
  });

  it.each(Object.keys(completeProfile))("requires a nonblank %s", (field) => {
    expect(
      needsProfileCompletion({ ...completeProfile, [field]: "  " }),
    ).toBe(true);
  });
});
