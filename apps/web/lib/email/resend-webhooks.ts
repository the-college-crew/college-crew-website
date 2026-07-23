import type { WebhookEventPayload } from "resend";

export const RESEND_DELIVERY_EVENT_TYPES = [
  "email.sent",
  "email.delivered",
  "email.delivery_delayed",
  "email.bounced",
  "email.complained",
  "email.failed",
  "email.suppressed",
] as const;

type SupportedEventType = (typeof RESEND_DELIVERY_EVENT_TYPES)[number];
type SupportedWebhookEvent = Extract<WebhookEventPayload, { type: SupportedEventType }>;

export type ResendDeliveryEvent = {
  providerMessageId: string;
  recipientEmail: string | null;
  eventType: SupportedEventType;
  eventCreatedAt: string;
  detail: string | null;
};

const SUPPORTED_EVENT_TYPES = new Set<string>(RESEND_DELIVERY_EVENT_TYPES);

/**
 * Provider diagnostics can contain an address or token-shaped value. Keep the
 * useful failure reason while ensuring neither reaches the database or logs.
 */
export function sanitizeEmailDiagnostic(value: string | null | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  return trimmed
    .replace(
      /[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+/gi,
      "[redacted-email]",
    )
    .replace(/\b(?:re|whsec)_[a-z0-9_-]+\b/gi, "[redacted-token]")
    .replace(/\bBearer\s+\S+/gi, "Bearer [redacted-token]")
    .slice(0, 500);
}

function eventDetail(event: SupportedWebhookEvent) {
  switch (event.type) {
    case "email.bounced":
      return sanitizeEmailDiagnostic(
        [event.data.bounce.type, event.data.bounce.subType, event.data.bounce.message]
          .filter(Boolean)
          .join(" · "),
      );
    case "email.failed":
      return sanitizeEmailDiagnostic(event.data.failed.reason);
    case "email.suppressed":
      return sanitizeEmailDiagnostic(
        [event.data.suppressed.type, event.data.suppressed.message]
          .filter(Boolean)
          .join(" · "),
      );
    case "email.delivery_delayed":
      return "Delivery was delayed by the recipient mail system.";
    case "email.complained":
      return "The recipient marked this message as spam.";
    default:
      return null;
  }
}

/** Convert only the operational email events College Crew subscribes to. */
export function normalizeResendDeliveryEvent(
  event: WebhookEventPayload,
): ResendDeliveryEvent | null {
  if (!SUPPORTED_EVENT_TYPES.has(event.type)) return null;

  const supported = event as SupportedWebhookEvent;
  const providerMessageId = supported.data.email_id?.trim();
  if (!providerMessageId) return null;

  const recipientEmail = supported.data.to[0]?.trim().toLowerCase() || null;
  return {
    providerMessageId,
    recipientEmail,
    eventType: supported.type,
    eventCreatedAt: supported.created_at,
    detail: eventDetail(supported),
  };
}
