import { describe, expect, it } from "vitest";

import {
  HOURLY_RATE_INPUT_CONSTRAINTS,
  buildHourlyOfferingPersistenceRow,
  buildQuoteOfferingPersistenceRow,
  getOfferingReadiness,
  groupAvailabilityWindows,
  parseAverageQuoteInput,
  parseHourlyRateInput,
  parseProviderAvailabilityForm,
  supportsQuotePricing,
  type AvailabilityWindow,
} from "./setup";

function validAvailabilityForm() {
  const form = new FormData();
  form.set("windowCount", "1");
  form.set("windowDay_0_0", "on");
  form.set("windowDay_0_4", "on");
  form.set("windowStart_0", "09:00");
  form.set("windowEnd_0", "17:00");
  form.set("availabilityNote", "Afternoons also work with notice.");
  form.set("serviceZip", "60614");
  form.set("noticeChoice", "24");
  return form;
}

function twoGroupAvailabilityForm() {
  const form = validAvailabilityForm();
  // Group 0: Mon+Fri 9-5 (from validAvailabilityForm). Group 1: Sat-Sun 12-4.
  form.set("windowCount", "2");
  form.set("windowDay_1_5", "on");
  form.set("windowDay_1_6", "on");
  form.set("windowStart_1", "12:00");
  form.set("windowEnd_1", "16:00");
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

describe("supported service quote input", () => {
  it("accepts an omitted average or an exact dollar amount", () => {
    expect(parseAverageQuoteInput("")).toEqual({
      success: true,
      cents: null,
    });
    expect(parseAverageQuoteInput("175.50")).toEqual({
      success: true,
      cents: 17_550,
    });
  });

  it("builds a quote row without an hourly rate", () => {
    expect(
      buildQuoteOfferingPersistenceRow({
        providerId: "provider",
        serviceId: "window-washing",
        averageQuoteCents: 17_500,
      }),
    ).toMatchObject({
      price_cents: 0,
      price_type: "quote",
      unit: "per_job",
      hourly_rate_cents: null,
      pricing_mode: "quote",
      average_quote_cents: 17_500,
    });
  });

  it("limits quote mode to the three approved visual-scope services", () => {
    expect(supportsQuotePricing("hauling")).toBe(true);
    expect(supportsQuotePricing("pressure-washing")).toBe(true);
    expect(supportsQuotePricing("window-washing")).toBe(true);
    expect(supportsQuotePricing("lawn-care")).toBe(false);
  });
});

describe("structured provider availability", () => {
  it("pins minimum notice to the fixed 12h pilot value", () => {
    const preset = parseProviderAvailabilityForm(validAvailabilityForm());
    expect(preset).toMatchObject({
      success: true,
      data: {
        windows: [
          { weekday: 0, start_local: "09:00", end_local: "17:00" },
          { weekday: 4, start_local: "09:00", end_local: "17:00" },
        ],
        service_zip: "60614",
        minimum_notice_hours: 12,
      },
    });

    // The pilot fixes notice platform-wide, so any submitted value — including
    // one outside the old 3-168h bounds — is ignored rather than rejected.
    for (const hours of [2, 3, 24, 168, 999]) {
      const custom = validAvailabilityForm();
      custom.set("noticeChoice", "custom");
      custom.set("customNoticeHours", String(hours));
      expect(parseProviderAvailabilityForm(custom)).toMatchObject({
        success: true,
        data: { minimum_notice_hours: 12 },
      });
    }
  });

  it("flattens multiple day-groups into sorted per-weekday windows", () => {
    const result = parseProviderAvailabilityForm(twoGroupAvailabilityForm());
    expect(result).toMatchObject({
      success: true,
      data: {
        windows: [
          { weekday: 0, start_local: "09:00", end_local: "17:00" },
          { weekday: 4, start_local: "09:00", end_local: "17:00" },
          { weekday: 5, start_local: "12:00", end_local: "16:00" },
          { weekday: 6, start_local: "12:00", end_local: "16:00" },
        ],
      },
    });
  });

  it("lets a weekday appear in two groups when the hours don't overlap", () => {
    // Mornings before class and evenings after are two periods on one day.
    const form = twoGroupAvailabilityForm();
    form.set("windowDay_1_0", "on"); // Monday, also in group 0 at 09:00-17:00.
    form.set("windowStart_1", "18:00");
    form.set("windowEnd_1", "21:00");

    const result = parseProviderAvailabilityForm(form);
    expect(result).toMatchObject({
      success: true,
      data: {
        windows: [
          { weekday: 0, start_local: "09:00", end_local: "17:00" },
          { weekday: 0, start_local: "18:00", end_local: "21:00" },
          { weekday: 4, start_local: "09:00", end_local: "17:00" },
          { weekday: 5, start_local: "18:00", end_local: "21:00" },
          { weekday: 6, start_local: "18:00", end_local: "21:00" },
        ],
      },
    });
  });

  it("rejects a weekday whose two groups overlap in time", () => {
    const form = twoGroupAvailabilityForm();
    form.set("windowDay_1_0", "on"); // Monday, already 09:00-17:00 in group 0.
    // Group 1 runs 12:00-16:00, which sits inside that.
    const result = parseProviderAvailabilityForm(form);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.fieldErrors.windows?.[1]?.days).toContain("Monday");
      expect(result.fieldErrors.windows?.[1]?.days).toContain("overlap");
    }
  });

  it("returns every relevant field error in one response", () => {
    const form = validAvailabilityForm();
    form.delete("windowDay_0_0");
    form.delete("windowDay_0_4");
    form.set("windowStart_0", "17:00");
    form.set("windowEnd_0", "09:00");
    form.set("serviceZip", "6061");

    const result = parseProviderAvailabilityForm(form);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.fieldErrors).toMatchObject({
        windows: {
          0: { days: expect.any(String), end: expect.any(String) },
        },
        serviceZip: expect.any(String),
      });
    }
  });

  it("requires at least one window", () => {
    const form = validAvailabilityForm();
    form.set("windowCount", "0");
    const result = parseProviderAvailabilityForm(form);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.fieldErrors.weekdays).toEqual(expect.any(String));
    }
  });
});

describe("availability window grouping", () => {
  it("groups shared hours and round-trips back to the same windows", () => {
    const windows: AvailabilityWindow[] = [
      { weekday: 5, start_local: "12:00:00", end_local: "16:00:00" },
      { weekday: 0, start_local: "09:00:00", end_local: "17:00:00" },
      { weekday: 3, start_local: "09:00:00", end_local: "17:00:00" },
      { weekday: 4, start_local: "12:00:00", end_local: "16:00:00" },
    ];
    const groups = groupAvailabilityWindows(windows);
    expect(groups).toEqual([
      { weekdays: [0, 3], start: "09:00", end: "17:00" },
      { weekdays: [4, 5], start: "12:00", end: "16:00" },
    ]);
    // Flattening the groups restores the sorted original set (HH:MM precision).
    const flattened = groups.flatMap((group) =>
      group.weekdays.map((weekday) => ({
        weekday,
        start_local: group.start,
        end_local: group.end,
      })),
    );
    expect(flattened.map((w) => w.weekday).toSorted((a, b) => a - b)).toEqual([
      0, 3, 4, 5,
    ]);
  });

  it("returns no groups for an empty window set", () => {
    expect(groupAvailabilityWindows([])).toEqual([]);
  });
});

describe("offering readiness", () => {
  const readyProfile = {
    verification_status: "approved" as const,
    stripe_account_id: "acct_test",
    stripe_transfers_active: true,
    stripe_transfers_checked_at: "2026-07-13T20:00:00.000Z",
    service_zip: "60614",
  };
  const readyWindows: AvailabilityWindow[] = [
    { weekday: 0, start_local: "09:00:00", end_local: "17:00:00" },
    { weekday: 2, start_local: "09:00:00", end_local: "17:00:00" },
    { weekday: 4, start_local: "12:00:00", end_local: "16:00:00" },
  ];

  it("is ready only when every public and private prerequisite passes", () => {
    expect(
      getOfferingReadiness(
        readyProfile,
        {
          hourly_rate_cents: 4_500,
          service_is_live: true,
        },
        readyWindows,
      ).bookable,
    ).toBe(true);
  });

  it.each(["hauling", "pressure-washing", "window-washing"])(
    "recognizes a %s quote offering without requiring an average",
    (serviceSlug) => {
      expect(
        getOfferingReadiness(
          readyProfile,
          {
            hourly_rate_cents: null,
            pricing_mode: "quote",
            average_quote_cents: null,
            service_slug: serviceSlug,
            service_is_live: true,
          },
          readyWindows,
        ).bookable,
      ).toBe(true);
    },
  );

  it("rejects quote mode for an unsupported service", () => {
    expect(
      getOfferingReadiness(
        readyProfile,
        {
          hourly_rate_cents: null,
          pricing_mode: "quote",
          average_quote_cents: null,
          service_slug: "lawn-care",
          service_is_live: true,
        },
        readyWindows,
      ).bookable,
    ).toBe(false);
  });

  it("identifies all missing prerequisites deterministically", () => {
    const readiness = getOfferingReadiness(
      {
        ...readyProfile,
        verification_status: "pending",
        stripe_transfers_active: false,
        service_zip: null,
      },
      { hourly_rate_cents: null, service_is_live: false },
      [],
    );

    expect(readiness.bookable).toBe(false);
    expect(readiness.missing.map(({ key }) => key)).toEqual([
      "verification",
      "payouts",
      "pricing",
      "availability",
      "service_zip",
      "live_service",
    ]);
  });
});
