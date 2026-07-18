import { describe, expect, it } from "vitest";

import {
  HOURLY_RATE_MAX_CENTS,
  HOURLY_RATE_MIN_CENTS,
  calculateInvoiceAllocation,
  calculatePlatformFeeCents,
} from "./policy";

/**
 * The first-hour PaymentIntent's application fee is computed in SQL
 * (begin_first_hour_payment) as `(rate * 500 + 5000) / 10000`. This guards that
 * the SQL expression stays identical to the shared TS fee helper, so the
 * charged fee and the persisted booking_payments row can never drift.
 */
function sqlFirstHourFee(rateCents: number): number {
  return Math.floor((rateCents * 500 + 5000) / 10000);
}

describe("first-hour application fee", () => {
  it("matches the SQL formula across the pilot rate range", () => {
    for (let rate = HOURLY_RATE_MIN_CENTS; rate <= HOURLY_RATE_MAX_CENTS; rate += 25) {
      expect(calculatePlatformFeeCents(rate)).toBe(sqlFirstHourFee(rate));
    }
  });

  it("charges the first hour as one hourly-rate amount", () => {
    const allocation = calculateInvoiceAllocation(5000, 120);
    expect(allocation.firstHourCents).toBe(5000);
    expect(allocation.firstHourPlatformFeeCents).toBe(250);
    expect(allocation.firstHourPlatformFeeCents).toBe(sqlFirstHourFee(5000));
  });
});
