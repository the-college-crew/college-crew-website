import { describe, expect, it } from "vitest";

import {
  HOURLY_RATE_INPUT_CONSTRAINTS,
  buildHourlyOfferingPersistenceRow,
  getOfferingReadiness,
  parseHourlyRateInput,
  parseProviderAvailabilityForm,
} from "./setup";

function validAvailabilityForm() {
  const form = new FormData();
  form.set("weekday_0", "on");
  form.set("weekday_4", "on");
  form.set("availabilityStart", "09:00");
  form.set("availabilityEnd", "17:00");
  form.set("availabilityNote", "Afternoons also work with notice.");
  form.set("serviceZip", "60614");
  form.set("noticeChoice", "24");
  return form;
}

describe("provider hourly rate input", () => {
  it("accepts the exact rate boundaries as integer cents", () => {
    expect(parseHourlyRateInput("20")).toEqual({ success: true, cents: 2_000 });
    expect(parseHourlyRateInput("150.00")).toEqual({
      success: true,
      cents: 15_000,
    });
    expect(parseHourlyRateInput("45.7")).toEqual({
      success: true,
      cents: 4_570,
    });
  });

  it("reveals the upper bound only after an invalid submission", () => {
    expect(HOURLY_RATE_INPUT_CONSTRAINTS).toEqual({ min: 20, step: "0.01" });
    expect(HOURLY_RATE_INPUT_CONSTRAINTS).not.toHaveProperty("max");

    const tooHigh = parseHourlyRateInput("150.01");
    expect(tooHigh.success).toBe(false);
    if (!tooHigh.success) expect(tooHigh.error).toContain("$150.00");
  });

  it("rejects sub-minimum, fractional-cent, and empty rates", () => {
    expect(parseHourlyRateInput("19.99").success).toBe(false);
    expect(parseHourlyRateInput("45.001").success).toBe(false);
    expect(parseHourlyRateInput("").success).toBe(false);
  });

  it("preserves legacy values and uses neutral placeholders only for new rows", () => {
    expect(
      buildHourlyOfferingPersistenceRow({
        providerId: "provider",
        serviceId: "service",
        hourlyRateCents: 4_500,
        existing: {
          price_cents: 8_500,
          price_type: "fixed",
          unit: "per_job",
        },
      }),
    ).toMatchObject({
      price_cents: 8_500,
      price_type: "fixed",
      unit: "per_job",
      hourly_rate_cents: 4_500,
    });
    expect(
      buildHourlyOfferingPersistenceRow({
        providerId: "provider",
        serviceId: "new-service",
        hourlyRateCents: 4_000,
      }),
    ).toMatchObject({
      price_cents: 0,
      price_type: "quote",
      unit: "per_hour",
      hourly_rate_cents: 4_000,
    });
  });
});

describe("structured provider availability", () => {
  it("parses valid preset and custom notice boundaries", () => {
    const preset = parseProviderAvailabilityForm(validAvailabilityForm());
    expect(preset).toMatchObject({
      success: true,
      data: {
        availability_weekdays: [0, 4],
        availability_start_local: "09:00",
        availability_end_local: "17:00",
        service_zip: "60614",
        minimum_notice_hours: 24,
      },
    });

    for (const hours of [3, 168]) {
      const custom = validAvailabilityForm();
      custom.set("noticeChoice", "custom");
      custom.set("customNoticeHours", String(hours));
      expect(parseProviderAvailabilityForm(custom)).toMatchObject({
        success: true,
        data: { minimum_notice_hours: hours },
      });
    }
  });

  it("returns every relevant field error in one response", () => {
    const form = validAvailabilityForm();
    form.delete("weekday_0");
    form.delete("weekday_4");
    form.set("availabilityStart", "17:00");
    form.set("availabilityEnd", "09:00");
    form.set("serviceZip", "6061");
    form.set("noticeChoice", "custom");
    form.set("customNoticeHours", "169");

    const result = parseProviderAvailabilityForm(form);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.fieldErrors).toMatchObject({
        weekdays: expect.any(String),
        availabilityEnd: expect.any(String),
        serviceZip: expect.any(String),
        minimumNoticeHours: expect.any(String),
      });
    }
  });

  it("rejects the lower custom notice boundary minus one", () => {
    const form = validAvailabilityForm();
    form.set("noticeChoice", "custom");
    form.set("customNoticeHours", "2");
    expect(parseProviderAvailabilityForm(form).success).toBe(false);
  });
});

describe("offering readiness", () => {
  const readyProfile = {
    verification_status: "approved" as const,
    stripe_account_id: "acct_test",
    stripe_transfers_active: true,
    stripe_transfers_checked_at: "2026-07-13T20:00:00.000Z",
    availability_weekdays: [0, 2, 4],
    availability_start_local: "09:00:00",
    availability_end_local: "17:00:00",
    service_zip: "60614",
  };

  it("is ready only when every public and private prerequisite passes", () => {
    expect(
      getOfferingReadiness(readyProfile, {
        hourly_rate_cents: 4_500,
        service_is_live: true,
      }).bookable,
    ).toBe(true);
  });

  it("identifies all missing prerequisites deterministically", () => {
    const readiness = getOfferingReadiness(
      {
        ...readyProfile,
        verification_status: "pending",
        stripe_transfers_active: false,
        availability_weekdays: [],
        service_zip: null,
      },
      { hourly_rate_cents: null, service_is_live: false },
    );

    expect(readiness.bookable).toBe(false);
    expect(readiness.missing.map(({ key }) => key)).toEqual([
      "verification",
      "payouts",
      "hourly_rate",
      "availability",
      "service_zip",
      "live_service",
    ]);
  });
});
