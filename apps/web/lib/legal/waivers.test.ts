import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  getBookingRiskSnapshot,
  getBookingAddendumSnapshot,
  getCustomerBookingTermsSnapshot,
  getMasterAgreementSnapshot,
  getPaymentAuthorizationSnapshot,
  getPlatformTermsSnapshot,
  getProviderTermsSnapshot,
  HOURLY_PAYMENT_AUTHORIZATION,
  LEGAL_CONTENT_VERSION,
} from "./waivers";

function hash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

describe("published legal content", () => {
  it("keeps the application snapshots aligned with the database contract", () => {
    expect(LEGAL_CONTENT_VERSION).toBe("2026-07-29");
    expect(hash(getMasterAgreementSnapshot("customer"))).toBe(
      "3f8ba9f91f0ced97509417e12bfadcd50094e466e07356fc6265b791152e10cd",
    );
    expect(hash(getMasterAgreementSnapshot("provider"))).toBe(
      "253bc1676a56cb66ebf9e326c9f80056606ab20d84e9ca768bb1ed67dc0fa027",
    );
    expect(hash(getPlatformTermsSnapshot())).toBe(
      "c8d21c1f8d64f46884ba65bce4ecc7808f3c45c4a20d39f06b368d19225f757b",
    );
    expect(hash(getCustomerBookingTermsSnapshot())).toBe(
      "4d0c985ce3809af8b6dacd25728ae38677164470553f2f2ac440d7a2e79f7c9d",
    );
    expect(hash(getProviderTermsSnapshot())).toBe(
      "f0f882fde99647191d17ee6ffa74a33e636ffe6dc8550b0d63cbb6c055973aad",
    );
  });

  it("includes the published hourly terms only in hourly booking snapshots", () => {
    const base = {
      serviceSlug: "lawn-yard-care",
      serviceName: "Lawn & Yard Care",
      scheduledAt: "July 20, 2026 at 10:00 AM",
      address: "100 Example Street, Chicago, IL",
      providerName: "Test Provider",
      customerName: "Test Customer",
    };

    expect(getBookingAddendumSnapshot(base)).not.toHaveProperty("hourlyTerms");
    expect(
      getBookingAddendumSnapshot({ ...base, includeHourlyTerms: true }),
    ).toMatchObject({ paymentAuthorization: HOURLY_PAYMENT_AUTHORIZATION });
  });

  it("keeps risk acceptance separate from the amount-specific authorization", () => {
    const risk = getBookingRiskSnapshot({
      serviceSlug: "lawn-yard-care",
      serviceName: "Lawn & Yard Care",
      scheduledAt: "July 20, 2026 at 10:00 AM",
      address: "100 Example Street, Chicago, IL",
      providerName: "Test Provider",
      customerName: "Test Customer",
    });
    expect(risk).not.toHaveProperty("hourlyTerms");
    expect(risk).not.toHaveProperty("paymentAuthorization");

    expect(
      getPaymentAuthorizationSnapshot({
        version: "hourly-v1-saved-method-2026-07-15",
        bookingId: "00000000-0000-0000-0000-000000000001",
        firstHourCents: 3000,
        estimatedTotalCents: 4500,
        estimatedBalanceCents: 1500,
        dueAt: "2026-07-20T10:00:00.000Z",
      }),
    ).toMatchObject({
      text: HOURLY_PAYMENT_AUTHORIZATION,
      amounts: { firstHourCents: 3000, estimatedBalanceCents: 1500 },
      scope: "booking_only",
    });
  });
});
