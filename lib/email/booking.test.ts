import { beforeEach, describe, expect, it, vi } from "vitest";

const sendEmail = vi.fn();

vi.mock("server-only", () => ({}));
vi.mock("@/lib/email/send", () => ({
  getPublicSiteUrl: () => "https://thecollegecrew.com",
  sendEmail: (...args: unknown[]) => sendEmail(...args),
}));

describe("booking outbox templates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sendEmail.mockResolvedValue({ ok: true });
  });

  it("uses the durable event key as the Resend idempotency key", async () => {
    const { sendBookingEmail } = await import("./booking");
    await sendBookingEmail({
      eventKey: "request_new_booking-id",
      template: "new_provider_request",
      recipientEmail: "provider@example.test",
      recipientKind: "provider",
      bookingId: "00000000-0000-0000-0000-000000000001",
      customerName: "Private Customer",
      providerName: "Provider",
      serviceName: "Dog walking",
      scheduledAt: "2026-07-20T15:00:00.000Z",
    });
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: "request_new_booking-id",
        redactedLog: true,
        requireProvider: true,
      }),
    );
  });

  it("puts only an opaque booking id in a replacement URL", async () => {
    const { sendBookingEmail } = await import("./booking");
    await sendBookingEmail({
      eventKey: "response_alert_booking-id",
      template: "response_alert",
      recipientEmail: "customer@example.test",
      recipientKind: "customer",
      bookingId: "00000000-0000-0000-0000-000000000001",
      customerName: "Private Customer",
      providerName: "Provider",
      serviceName: "Dog walking",
      scheduledAt: null,
    });
    const options = sendEmail.mock.calls[0][0] as { text: string };
    expect(options.text).toContain(
      "https://thecollegecrew.com/bookings/00000000-0000-0000-0000-000000000001/replace",
    );
    expect(options.text).not.toContain("Private Customer");
    expect(options.text).not.toContain("customer@example.test");
  });

  it("deep-links completed customers to the persistent review prompt", async () => {
    const { sendBookingEmail } = await import("./booking");
    await sendBookingEmail({
      eventKey: "completed_customer_booking-id",
      template: "final_payment_success",
      recipientEmail: "customer@example.test",
      recipientKind: "customer",
      bookingId: "00000000-0000-0000-0000-000000000001",
      customerName: "Private Customer",
      providerName: "Provider",
      serviceName: "Dog walking",
      scheduledAt: null,
    });
    const options = sendEmail.mock.calls[0][0] as {
      text: string;
      html: string;
    };
    expect(options.text).toContain(
      "https://thecollegecrew.com/dashboard#booking-00000000-0000-0000-0000-000000000001",
    );
    expect(options.html).toContain("Rate your provider");
  });
});
