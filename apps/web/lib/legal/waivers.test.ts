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
    expect(LEGAL_CONTENT_VERSION).toBe("2026-07-15");
    expect(hash(getMasterAgreementSnapshot("customer"))).toBe(
      "c23126dcfbd3b87132b66c7786de09a940edac9270bb5c59e423ce52dca43ed1",
    );
    expect(hash(getMasterAgreementSnapshot("provider"))).toBe(
      "e89347ece1acb4359f73bc6d368bdef77775b7aac84da6e463430f17f7b745ca",
    );
    expect(hash(getPlatformTermsSnapshot())).toBe(
      "073db4d8ee14222513c69c85e6b7c25005b568232f6d00492e4a0fbdb1c76073",
    );
    expect(hash(getCustomerBookingTermsSnapshot())).toBe(
      "6c1466f50728eb4208fab6b006df9544219ab253b0690170ded587fdf3093e95",
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
