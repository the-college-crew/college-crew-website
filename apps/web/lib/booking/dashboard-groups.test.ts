import { describe, expect, it } from "vitest";

import {
  partitionBookings,
  REVIEW_PROMPT_WINDOW_DAYS,
  type DashboardBooking,
} from "./dashboard-groups";

const NOW = new Date("2026-07-24T18:00:00Z");
const DAY_MS = 24 * 60 * 60 * 1000;

function booking(overrides: Partial<DashboardBooking> = {}): DashboardBooking {
  return {
    id: crypto.randomUUID(),
    booking_flow: "hourly_v1",
    status: "booked",
    scheduled_at: new Date(NOW.getTime() + 2 * DAY_MS).toISOString(),
    address: "155 N Clinton Ave",
    price_cents: 3000,
    estimated_minutes: 60,
    hourly_rate_cents_snapshot: 3000,
    average_quote_cents_snapshot: null,
    response_alert_at: null,
    initial_payment_due_at: null,
    en_route_at: null,
    dismissed_at: null,
    review_prompt_dismissed_at: null,
    work_completed_at: null,
    cancelled_by_role: null,
    proposed_start_at: null,
    counter_note: null,
    service: { name: "Tutoring", slug: "tutoring" },
    provider: { display_name: "Ari Schwartz" },
    review: null,
    invoice: null,
    dispute: null,
    ...overrides,
  };
}

describe("partitionBookings — needs attention", () => {
  it("puts a countered booking in attention, not Past", () => {
    // Regression: 'countered' was absent from the upcoming statuses, so a
    // provider's proposed new time silently landed in the Past tab.
    const row = booking({
      status: "countered",
      proposed_start_at: new Date(NOW.getTime() + 3 * DAY_MS).toISOString(),
    });
    const { attention, past } = partitionBookings([row], NOW);

    expect(attention).toHaveLength(1);
    expect(attention[0].attentionReason).toBe("countered");
    expect(past).toHaveLength(0);
  });

  it("distinguishes each attention reason", () => {
    const rows = [
      booking({ status: "declined" }),
      booking({ status: "cancelled", cancelled_by_role: "provider" }),
      booking({
        status: "countered",
        proposed_start_at: new Date(NOW.getTime() + DAY_MS).toISOString(),
      }),
      booking({
        status: "requested",
        response_alert_at: new Date(NOW.getTime() - 3_600_000).toISOString(),
      }),
    ];
    const { attention } = partitionBookings(rows, NOW);

    expect(new Set(attention.map((row) => row.attentionReason))).toEqual(
      new Set(["declined", "provider_cancelled", "countered", "no_response"]),
    );
  });

  it("leaves a customer's own cancellation out of attention", () => {
    const row = booking({ status: "cancelled", cancelled_by_role: "customer" });
    const { attention, past } = partitionBookings([row], NOW);

    expect(attention).toHaveLength(0);
    expect(past).toHaveLength(1);
  });

  it("sorts by soonest job first", () => {
    const soon = booking({
      status: "declined",
      scheduled_at: new Date(NOW.getTime() + 3_600_000).toISOString(),
    });
    const later = booking({
      status: "declined",
      scheduled_at: new Date(NOW.getTime() + 5 * DAY_MS).toISOString(),
    });
    const { attention } = partitionBookings([later, soon], NOW);

    expect(attention.map((row) => row.id)).toEqual([soon.id, later.id]);
  });

  it("treats an unanswered request past its start time as expired", () => {
    const row = booking({
      status: "requested",
      scheduled_at: new Date(NOW.getTime() - 3_600_000).toISOString(),
      response_alert_at: new Date(NOW.getTime() - 7_200_000).toISOString(),
    });
    const { attention, past } = partitionBookings([row], NOW);

    expect(attention).toHaveLength(0);
    expect(past[0].status).toBe("expired");
  });
});

describe("partitionBookings — dismissal", () => {
  it("moves a dismissed booking to Past instead of hiding it entirely", () => {
    // Dismissal is not deletion: a provider cancellation may have a refund
    // attached, so the customer must still be able to find it.
    const row = booking({
      status: "cancelled",
      cancelled_by_role: "provider",
      dismissed_at: NOW.toISOString(),
    });
    const { attention, upcoming, past } = partitionBookings([row], NOW);

    expect(attention).toHaveLength(0);
    expect(upcoming).toHaveLength(0);
    expect(past).toHaveLength(1);
  });

  it("keeps a dismissed declined request out of attention", () => {
    const row = booking({
      status: "declined",
      dismissed_at: NOW.toISOString(),
    });
    const { attention, past } = partitionBookings([row], NOW);

    expect(attention).toHaveLength(0);
    expect(past).toHaveLength(1);
  });
});

describe("partitionBookings — review prompts", () => {
  const completed = (overrides: Partial<DashboardBooking> = {}) =>
    booking({
      status: "completed",
      scheduled_at: new Date(NOW.getTime() - 2 * DAY_MS).toISOString(),
      work_completed_at: new Date(NOW.getTime() - 2 * DAY_MS).toISOString(),
      ...overrides,
    });

  it("prompts for a recent unreviewed job and still lists it under Past", () => {
    const { reviewable, past } = partitionBookings([completed()], NOW);

    expect(reviewable).toHaveLength(1);
    expect(past).toHaveLength(1);
  });

  it("drops the prompt once a review exists", () => {
    const { reviewable } = partitionBookings(
      [completed({ review: { id: crypto.randomUUID() } })],
      NOW,
    );

    expect(reviewable).toHaveLength(0);
  });

  it("drops the prompt when skipped, but keeps the job reviewable in Past", () => {
    const row = completed({ review_prompt_dismissed_at: NOW.toISOString() });
    const { reviewable, past } = partitionBookings([row], NOW);

    expect(reviewable).toHaveLength(0);
    expect(past).toHaveLength(1);
    expect(past[0].review).toBeNull();
  });

  it("stops prompting after the review window closes", () => {
    const stale = completed({
      work_completed_at: new Date(
        NOW.getTime() - (REVIEW_PROMPT_WINDOW_DAYS + 1) * DAY_MS,
      ).toISOString(),
    });
    const fresh = completed({
      work_completed_at: new Date(
        NOW.getTime() - (REVIEW_PROMPT_WINDOW_DAYS - 1) * DAY_MS,
      ).toISOString(),
    });
    const { reviewable } = partitionBookings([stale, fresh], NOW);

    expect(reviewable.map((row) => row.id)).toEqual([fresh.id]);
  });

  it("does not ask for a review while a dispute is open", () => {
    const row = completed({
      dispute: { id: crypto.randomUUID(), status: "open" },
    });
    const { reviewable } = partitionBookings([row], NOW);

    expect(reviewable).toHaveLength(0);
  });

  it("falls back to the scheduled time when work_completed_at is missing", () => {
    const row = completed({ work_completed_at: null });
    const { reviewable } = partitionBookings([row], NOW);

    expect(reviewable).toHaveLength(1);
  });
});
