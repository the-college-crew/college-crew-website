import { afterEach, describe, expect, it } from "vitest";

import {
  areBookingRequestsEnabled,
  isHourlyBookingEnabled,
} from "./env";

const originalHourlyFlag = process.env.HOURLY_BOOKING_ENABLED;
const originalRequestFlag = process.env.BOOKING_REQUESTS_ENABLED;

afterEach(() => {
  if (originalHourlyFlag === undefined) {
    delete process.env.HOURLY_BOOKING_ENABLED;
  } else {
    process.env.HOURLY_BOOKING_ENABLED = originalHourlyFlag;
  }

  if (originalRequestFlag === undefined) {
    delete process.env.BOOKING_REQUESTS_ENABLED;
  } else {
    process.env.BOOKING_REQUESTS_ENABLED = originalRequestFlag;
  }
});

describe("hourly booking rollout flags", () => {
  it("defaults both hourly visibility and request creation to disabled", () => {
    delete process.env.HOURLY_BOOKING_ENABLED;
    delete process.env.BOOKING_REQUESTS_ENABLED;

    expect(isHourlyBookingEnabled()).toBe(false);
    expect(areBookingRequestsEnabled()).toBe(false);
  });

  it("enables a flag only for an explicit true value", () => {
    process.env.HOURLY_BOOKING_ENABLED = " TRUE ";
    process.env.BOOKING_REQUESTS_ENABLED = "false";

    expect(isHourlyBookingEnabled()).toBe(true);
    expect(areBookingRequestsEnabled()).toBe(false);
  });
});
