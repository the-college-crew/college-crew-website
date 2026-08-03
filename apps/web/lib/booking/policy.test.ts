import { describe, expect, it } from "vitest";

import {
  BILLING_INCREMENT_MINUTES,
  BILLING_MINIMUM_MINUTES,
  CUSTOMER_ESTIMATE_MINUTES,
  CUSTOMER_REFUND_NOTICE_HOURS,
  DEFAULT_RESPONSE_WINDOW_HOURS,
  HOURLY_RATE_MAX_CENTS,
  HOURLY_RATE_MIN_CENTS,
  INITIAL_PAYMENT_WINDOW_HOURS,
  INVOICE_REVIEW_HOURS,
  LATE_DISPUTE_DAYS,
  MINIMUM_NOTICE_HOURS,
  NOTICE_HOUR_PRESETS,
  PILOT_TIME_ZONE,
  PLATFORM_FEE_BPS,
  PROVIDER_INVOICE_MINUTES,
  RESPONSE_WINDOW_HOURS,
  billableMinutesFromElapsed,
  calculateHourlySubtotalCents,
  calculateInvoiceAllocation,
  calculatePlatformFeeCents,
  classifyPreArrivalCancellation,
  deriveInitialPaymentDueAt,
  deriveInvoiceAutochargeAt,
  deriveLateDisputeDueAt,
  deriveResponseAlertAt,
  doesSlotFitPilotAvailability,
  eligibleResponseWindowHours,
  getPilotLocalParts,
  isDurationValid,
  isHourlyRateValid,
  pilotLocalDateTimeToUtc,
  roundPositiveRatio,
} from "./policy";

describe("hourly booking policy constants", () => {
  it("locks the approved pilot values", () => {
    expect(PILOT_TIME_ZONE).toBe("America/Chicago");
    expect(PLATFORM_FEE_BPS).toBe(500);
    expect([HOURLY_RATE_MIN_CENTS, HOURLY_RATE_MAX_CENTS]).toEqual([
      2_000, 15_000,
    ]);
    expect([BILLING_MINIMUM_MINUTES, BILLING_INCREMENT_MINUTES]).toEqual([
      60, 15,
    ]);
    expect(CUSTOMER_ESTIMATE_MINUTES).toEqual({ min: 60, max: 720 });
    expect(PROVIDER_INVOICE_MINUTES).toEqual({ min: 60, max: 1_440 });
    expect(RESPONSE_WINDOW_HOURS).toEqual([1, 3, 5, 12, 24, 48, 72]);
    expect(DEFAULT_RESPONSE_WINDOW_HOURS).toBe(3);
    expect(NOTICE_HOUR_PRESETS).toEqual([3, 6, 12, 24, 48, 72, 168]);
    expect(MINIMUM_NOTICE_HOURS).toEqual({ min: 3, max: 168, default: 24 });
    expect(INITIAL_PAYMENT_WINDOW_HOURS).toBe(12);
    expect(CUSTOMER_REFUND_NOTICE_HOURS).toBe(12);
    expect(INVOICE_REVIEW_HOURS).toBe(24);
    expect(LATE_DISPUTE_DAYS).toBe(7);
  });
});

describe("money and duration calculations", () => {
  it("rounds positive ratios to the nearest integer with half cents up", () => {
    expect(roundPositiveRatio(0, 60)).toBe(0);
    expect(roundPositiveRatio(1, 2)).toBe(1);
    expect(roundPositiveRatio(2, 3)).toBe(1);
    expect(() => roundPositiveRatio(-1, 2)).toThrow(RangeError);
  });

  it("validates rate and quarter-hour duration bounds", () => {
    expect(isHourlyRateValid(2_000)).toBe(true);
    expect(isHourlyRateValid(15_000)).toBe(true);
    expect(isHourlyRateValid(1_999)).toBe(false);
    expect(isHourlyRateValid(15_001)).toBe(false);
    expect(isDurationValid(60, CUSTOMER_ESTIMATE_MINUTES)).toBe(true);
    expect(isDurationValid(720, CUSTOMER_ESTIMATE_MINUTES)).toBe(true);
    expect(isDurationValid(61, CUSTOMER_ESTIMATE_MINUTES)).toBe(false);
    expect(isDurationValid(1_440, PROVIDER_INVOICE_MINUTES)).toBe(true);
  });

  it("rounds elapsed time up and clamps it to invoice bounds", () => {
    expect(billableMinutesFromElapsed(0)).toBe(60);
    expect(billableMinutesFromElapsed(60)).toBe(60);
    expect(billableMinutesFromElapsed(60.01)).toBe(75);
    expect(billableMinutesFromElapsed(1_500)).toBe(1_440);
    expect(() => billableMinutesFromElapsed(-1)).toThrow(RangeError);
  });

  it("uses integer-cent rounding and prevents split-fee drift", () => {
    expect(calculateHourlySubtotalCents(3_333, 75)).toBe(4_166);
    expect(calculatePlatformFeeCents(2_010)).toBe(101);
    expect(calculateInvoiceAllocation(3_333, 75)).toEqual({
      subtotalCents: 4_166,
      totalPlatformFeeCents: 208,
      firstHourCents: 3_333,
      firstHourPlatformFeeCents: 167,
      remainingBalanceCents: 833,
      remainingPlatformFeeCents: 41,
    });
    expect(calculateInvoiceAllocation(3_333, 60).remainingPlatformFeeCents).toBe(
      0,
    );
  });
});

describe("persisted deadline derivation", () => {
  it("limits response choices to deadlines strictly before the start", () => {
    const requestedAt = "2026-07-13T12:00:00.000Z";
    const scheduledAt = "2026-07-14T00:00:00.000Z";

    expect(eligibleResponseWindowHours(requestedAt, scheduledAt)).toEqual([
      1, 3, 5,
    ]);
    expect(deriveResponseAlertAt(requestedAt, 3).toISOString()).toBe(
      "2026-07-13T15:00:00.000Z",
    );
    expect(() => deriveResponseAlertAt(requestedAt, 2)).toThrow(RangeError);
  });

  it("uses the earlier of acceptance plus 12 hours or scheduled start", () => {
    expect(
      deriveInitialPaymentDueAt(
        "2026-07-13T12:00:00.000Z",
        "2026-07-14T12:00:00.000Z",
      ).toISOString(),
    ).toBe("2026-07-14T00:00:00.000Z");
    expect(
      deriveInitialPaymentDueAt(
        "2026-07-13T12:00:00.000Z",
        "2026-07-13T18:00:00.000Z",
      ).toISOString(),
    ).toBe("2026-07-13T18:00:00.000Z");
  });

  it("derives invoice review and late-dispute deadlines in elapsed hours", () => {
    const start = "2026-03-08T07:30:00.000Z";
    expect(deriveInvoiceAutochargeAt(start).toISOString()).toBe(
      "2026-03-09T07:30:00.000Z",
    );
    expect(deriveLateDisputeDueAt(start).toISOString()).toBe(
      "2026-03-15T07:30:00.000Z",
    );
  });
});

describe("cancellation policy", () => {
  const scheduledAt = "2026-07-14T18:00:00.000Z";

  it("honors the exact 12-hour customer refund boundary", () => {
    expect(
      classifyPreArrivalCancellation({
        actor: "customer",
        cancelledAt: "2026-07-14T06:00:00.000Z",
        scheduledAt,
        hasCapturedFirstHour: true,
      }),
    ).toBe("full_refund");
    expect(
      classifyPreArrivalCancellation({
        actor: "customer",
        cancelledAt: "2026-07-14T06:00:00.001Z",
        scheduledAt,
        hasCapturedFirstHour: true,
      }),
    ).toBe("no_refund");
  });

  it("separates provider cancellation, arrival, unpaid, and no-show cases", () => {
    expect(
      classifyPreArrivalCancellation({
        actor: "provider",
        cancelledAt: "2026-07-14T17:00:00.000Z",
        scheduledAt,
        hasCapturedFirstHour: true,
      }),
    ).toBe("full_refund");
    expect(
      classifyPreArrivalCancellation({
        actor: "customer",
        cancelledAt: "2026-07-14T17:00:00.000Z",
        scheduledAt,
        hasCapturedFirstHour: false,
      }),
    ).toBe("no_payment");
    expect(
      classifyPreArrivalCancellation({
        actor: "customer",
        cancelledAt: scheduledAt,
        scheduledAt,
        hasCapturedFirstHour: false,
      }),
    ).toBe("provider_no_show_dispute");
    expect(
      classifyPreArrivalCancellation({
        actor: "customer",
        cancelledAt: "2026-07-14T17:00:00.000Z",
        scheduledAt,
        arrivedAt: "2026-07-14T16:50:00.000Z",
        hasCapturedFirstHour: true,
      }),
    ).toBe("manual_review");
  });
});

describe("America/Chicago DST boundaries", () => {
  it("skips the spring-forward hour while elapsed deadlines remain stable", () => {
    const before = getPilotLocalParts("2026-03-08T07:30:00.000Z");
    const after = getPilotLocalParts("2026-03-08T08:30:00.000Z");

    expect({ hour: before.hour, offset: before.offset }).toEqual({
      hour: 1,
      offset: "GMT-06:00",
    });
    expect({ hour: after.hour, offset: after.offset }).toEqual({
      hour: 3,
      offset: "GMT-05:00",
    });
  });

  it("distinguishes the repeated fall-back hour by UTC offset", () => {
    const first = getPilotLocalParts("2026-11-01T06:30:00.000Z");
    const second = getPilotLocalParts("2026-11-01T07:30:00.000Z");

    expect({ hour: first.hour, offset: first.offset }).toEqual({
      hour: 1,
      offset: "GMT-05:00",
    });
    expect({ hour: second.hour, offset: second.offset }).toEqual({
      hour: 1,
      offset: "GMT-06:00",
    });
  });

  it("converts only unambiguous Chicago wall-clock values", () => {
    const ordinary = pilotLocalDateTimeToUtc("2026-07-15T14:30");
    expect(ordinary.ok && ordinary.date.toISOString()).toBe(
      "2026-07-15T19:30:00.000Z",
    );
    expect(pilotLocalDateTimeToUtc("2026-03-08T02:30")).toEqual({
      ok: false,
      reason: "nonexistent",
    });
    expect(pilotLocalDateTimeToUtc("2026-11-01T01:30")).toEqual({
      ok: false,
      reason: "ambiguous",
    });
  });

  it("requires the full elapsed slot to remain in one availability window", () => {
    // Wed 9-5 only.
    const base = {
      windows: [{ weekday: 2, startLocal: "09:00", endLocal: "17:00" }],
    };
    expect(
      doesSlotFitPilotAvailability({
        ...base,
        // Wed 2026-07-15 09:00 CT.
        scheduledAt: "2026-07-15T14:00:00.000Z",
        estimatedMinutes: 120,
      }),
    ).toBe(true);
    expect(
      doesSlotFitPilotAvailability({
        ...base,
        // Wed 16:30 CT — the elapsed hour overruns the 17:00 close.
        scheduledAt: "2026-07-15T21:30:00.000Z",
        estimatedMinutes: 60,
      }),
    ).toBe(false);
  });

  it("enforces each day's own window when hours differ per day", () => {
    // Mon-Thu 9-5, Fri-Sat 12-4, Sunday closed.
    const windows = [
      { weekday: 0, startLocal: "09:00", endLocal: "17:00" },
      { weekday: 1, startLocal: "09:00", endLocal: "17:00" },
      { weekday: 2, startLocal: "09:00", endLocal: "17:00" },
      { weekday: 3, startLocal: "09:00", endLocal: "17:00" },
      { weekday: 4, startLocal: "12:00", endLocal: "16:00" },
      { weekday: 5, startLocal: "12:00", endLocal: "16:00" },
    ];
    // Mon 2026-07-13 10:00 CT fits Monday's 9-5.
    expect(
      doesSlotFitPilotAvailability({
        windows,
        scheduledAt: "2026-07-13T15:00:00.000Z",
        estimatedMinutes: 120,
      }),
    ).toBe(true);
    // Fri 2026-07-17 10:00 CT fits Monday's hours but NOT Friday's 12-4.
    expect(
      doesSlotFitPilotAvailability({
        windows,
        scheduledAt: "2026-07-17T15:00:00.000Z",
        estimatedMinutes: 120,
      }),
    ).toBe(false);
    // Fri 13:00 CT fits Friday's 12-4.
    expect(
      doesSlotFitPilotAvailability({
        windows,
        scheduledAt: "2026-07-17T18:00:00.000Z",
        estimatedMinutes: 120,
      }),
    ).toBe(true);
    // Sun 2026-07-19 13:00 CT — no Sunday window at all.
    expect(
      doesSlotFitPilotAvailability({
        windows,
        scheduledAt: "2026-07-19T18:00:00.000Z",
        estimatedMinutes: 60,
      }),
    ).toBe(false);
    // Sat 15:30 CT crossing local midnight-adjacent close: overruns 16:00.
    expect(
      doesSlotFitPilotAvailability({
        windows,
        scheduledAt: "2026-07-18T20:30:00.000Z",
        estimatedMinutes: 60,
      }),
    ).toBe(false);
  });
});
