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
    expect(LEGAL_CONTENT_VERSION).toBe("2026-07-20");
    expect(hash(getMasterAgreementSnapshot("customer"))).toBe(
      "f3f1453c08eedafde5cab1d4c247e383f3185268d7ed5e75cb3a9c9a46b141b7",
    );
    expect(hash(getMasterAgreementSnapshot("provider"))).toBe(
      "43e89f695e35f56586a36491bccbeeef451dba1563c9889308569eabf718b858",
    );
    expect(hash(getPlatformTermsSnapshot())).toBe(
      "603a6f06820600bed07b092e4281c1d94e8f8b5d56b7dc9fe1c6e307d2047dd8",
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
