import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  getBookingAddendumSnapshot,
  getMasterAgreementSnapshot,
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
});
