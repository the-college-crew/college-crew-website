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
    expect(LEGAL_CONTENT_VERSION).toBe("2026-07-29.1");
    expect(hash(getMasterAgreementSnapshot("customer"))).toBe(
      "f7b23598cd7228059da9cfd0d55fc2f2f1ba5a8ba6a69325d37c863b263ecad5",
    );
    expect(hash(getMasterAgreementSnapshot("provider"))).toBe(
      "fcacd2a7cfbc9fd65dce5a86ef251735dc9660fe565c086c93e052d8ecd1f880",
    );
    expect(hash(getPlatformTermsSnapshot())).toBe(
      "28eaacafe053ee7d5bde0001210d65a960c417be15cef5b157c19e5425f9a99c",
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
