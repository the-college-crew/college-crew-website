import { describe, expect, it } from "vitest";

import {
  BOOKING_COPY_FIELDS,
  BOOKING_COPY_SCREENS,
  bookingCopyTokens,
  bookingCopyValue,
  validateBookingCopyValue,
} from "./booking-copy";

describe("booking copy registry", () => {
  it("has unique screen ids and content keys", () => {
    const screenIds = BOOKING_COPY_SCREENS.map((screen) => screen.id);
    const keys = BOOKING_COPY_FIELDS.map((field) => field.key);

    expect(new Set(screenIds).size).toBe(screenIds.length);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("keeps every field within the existing site_content constraints", () => {
    for (const field of BOOKING_COPY_FIELDS) {
      expect(field.key).toMatch(/^[a-z0-9-]+(\.[a-z0-9-]+)+$/);
      expect(field.key.length).toBeLessThanOrEqual(120);
      expect(field.defaultValue.trim().length).toBeGreaterThan(0);
      expect(field.defaultValue.length).toBeLessThanOrEqual(4000);
      expect(field.livePaths.length).toBeGreaterThan(0);
    }
  });

  it("accepts defaults and rejects missing, duplicated, or invented tokens", () => {
    const key = "booking-customer.confirm.payment-explanation";
    const definition = BOOKING_COPY_FIELDS.find((field) => field.key === key);
    expect(definition).toBeDefined();

    expect(validateBookingCopyValue(key, definition!.defaultValue)).toEqual(
      expect.objectContaining({ ok: true }),
    );
    expect(
      validateBookingCopyValue(
        key,
        "Pay the first hour now and charge the rest later.",
      ),
    ).toEqual(expect.objectContaining({ ok: false }));
    expect(
      validateBookingCopyValue(
        key,
        "Pay {first_hour_amount} now, then {first_hour_amount} again.",
      ),
    ).toEqual(expect.objectContaining({ ok: false }));
    expect(
      validateBookingCopyValue(
        key,
        "Pay {first_hour_amount} now for {customer_name}.",
      ),
    ).toEqual(expect.objectContaining({ ok: false }));
  });

  it("substitutes preview/live values without persisting fixture data", () => {
    const key = "booking-customer.counter.hold-note";
    const result = bookingCopyValue({}, key, { hold_amount: "$52.00" });

    expect(result).toContain("$52.00");
    expect(result).not.toContain("{hold_amount}");
  });

  it("lists tokens deterministically", () => {
    expect(
      bookingCopyTokens(
        "Pay {amount} to {provider_name}; keep {amount} visible once.",
      ),
    ).toEqual(["amount", "amount", "provider_name"]);
  });
});
