import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const runBookingScheduler = vi.fn();

vi.mock("@/lib/booking/automation", () => ({ runBookingScheduler }));

describe("booking scheduler route", () => {
  beforeEach(() => {
    process.env.BOOKING_CRON_SECRET = "phase7-secret-for-tests";
    runBookingScheduler.mockResolvedValue({
      jobs: { claimed: 0, succeeded: 0, retried: 0, failed: 0 },
      email: { claimed: 0, succeeded: 0, retried: 0, failed: 0 },
    });
  });
  afterEach(() => {
    vi.clearAllMocks();
    delete process.env.BOOKING_CRON_SECRET;
  });

  it("returns 503 when the scheduler secret is not configured", async () => {
    delete process.env.BOOKING_CRON_SECRET;
    const { POST } = await import("./route");
    const response = await POST(new Request("http://test/internal", { method: "POST" }));
    expect(response.status).toBe(503);
    expect(runBookingScheduler).not.toHaveBeenCalled();
  });

  it("rejects missing and incorrect bearer credentials", async () => {
    const { POST } = await import("./route");
    const missing = await POST(new Request("http://test/internal", { method: "POST" }));
    const wrong = await POST(
      new Request("http://test/internal", {
        method: "POST",
        headers: { authorization: "Bearer wrong-secret" },
      }),
    );
    expect(missing.status).toBe(401);
    expect(wrong.status).toBe(401);
    expect(runBookingScheduler).not.toHaveBeenCalled();
  });

  it("runs one bounded cycle and returns aggregate counters", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://test/internal", {
        method: "POST",
        headers: { authorization: "Bearer phase7-secret-for-tests" },
      }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      jobs: { claimed: 0, succeeded: 0, retried: 0, failed: 0 },
      email: { claimed: 0, succeeded: 0, retried: 0, failed: 0 },
    });
    expect(runBookingScheduler).toHaveBeenCalledTimes(1);
  });
});
