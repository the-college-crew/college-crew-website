import { describe, expect, it } from "vitest";

import {
  hasActiveProviderVerificationBypass,
  isProviderIdentityVerificationSatisfied,
} from "./verification";

const profile = {
  id_document_url: null,
  id_document_back_url: null,
  verification_bypassed: false,
  verification_status: "pending" as const,
};

describe("provider identity verification", () => {
  it("accepts the normal verified-school-email and two-sided ID path", () => {
    expect(
      isProviderIdentityVerificationSatisfied(
        {
          ...profile,
          id_document_url: "front.jpg",
          id_document_back_url: "back.jpg",
        },
        true,
      ),
    ).toBe(true);
  });

  it("accepts an approved founder bypass without school email or ID", () => {
    const bypassed = {
      ...profile,
      verification_bypassed: true,
      verification_status: "approved" as const,
    };

    expect(hasActiveProviderVerificationBypass(bypassed)).toBe(true);
    expect(isProviderIdentityVerificationSatisfied(bypassed, false)).toBe(true);
  });

  it.each(["pending", "rejected"] as const)(
    "does not honor historical bypass audit data while status is %s",
    (verification_status) => {
      const reopened = {
        ...profile,
        verification_bypassed: true,
        verification_status,
      };

      expect(hasActiveProviderVerificationBypass(reopened)).toBe(false);
      expect(isProviderIdentityVerificationSatisfied(reopened, false)).toBe(
        false,
      );
    },
  );
});
