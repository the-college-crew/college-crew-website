import { describe, expect, it } from "vitest";

import type {
  EmailBouncedEvent,
  EmailDeliveredEvent,
  EmailOpenedEvent,
} from "resend";

import {
  normalizeResendDeliveryEvent,
  sanitizeEmailDiagnostic,
} from "./resend-webhooks";

const baseData = {
  created_at: "2026-07-23T20:00:00.000Z",
  email_id: "email_test_123",
  from: "College Crew <no-reply@send.example.com>",
  to: ["STUDENT@EXAMPLE.TEST"],
  subject: "Test notification",
};

describe("Resend delivery webhooks", () => {
  it("normalizes a delivery event and recipient", () => {
    const event: EmailDeliveredEvent = {
      type: "email.delivered",
      created_at: "2026-07-23T20:01:00.000Z",
      data: baseData,
    };

    expect(normalizeResendDeliveryEvent(event)).toEqual({
      providerMessageId: "email_test_123",
      recipientEmail: "student@example.test",
      eventType: "email.delivered",
      eventCreatedAt: "2026-07-23T20:01:00.000Z",
      detail: null,
    });
  });

  it("keeps useful bounce context while redacting addresses and secrets", () => {
    const event: EmailBouncedEvent = {
      type: "email.bounced",
      created_at: "2026-07-23T20:02:00.000Z",
      data: {
        ...baseData,
        bounce: {
          type: "Permanent",
          subType: "General",
          message:
            "student@example.test rejected re_do-not-store and whsec_do-not-store",
        },
      },
    };

    const normalized = normalizeResendDeliveryEvent(event);
    expect(normalized?.detail).toContain("Permanent · General");
    expect(normalized?.detail).not.toContain("student@example.test");
    expect(normalized?.detail).not.toContain("do-not-store");
  });

  it("ignores engagement events that are outside operational scope", () => {
    const event: EmailOpenedEvent = {
      type: "email.opened",
      created_at: "2026-07-23T20:03:00.000Z",
      data: baseData,
    };

    expect(normalizeResendDeliveryEvent(event)).toBeNull();
  });

  it("redacts bearer tokens from standalone diagnostics", () => {
    expect(
      sanitizeEmailDiagnostic(
        "Bearer secret-token-value for person@example.test",
      ),
    ).toBe("Bearer [redacted-token] for [redacted-email]");
  });
});
