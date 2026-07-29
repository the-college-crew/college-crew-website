/**
 * Booking outbox email delivery. Port of apps/web/lib/email/booking.ts plus
 * the slice of lib/email/send.ts the outbox drain needs. Resend is called
 * over plain HTTPS (no SDK) with the outbox event key as the idempotency key.
 *
 * With no RESEND_API_KEY the delivery is stubbed with a REDACTED log and
 * reported as failed (`requireProvider` semantics) so the durable outbox
 * retries instead of treating a stub as sent.
 */

import { createAdminClient } from "./admin.ts";

export type SendResult =
  | { ok: true; providerMessageId?: string }
  | { ok: false; errorClass: string; error: string };

export type BookingEmailContext = {
  eventKey: string;
  template: string;
  recipientEmail: string;
  recipientKind?: string;
  bookingId: string | null;
  customerName: string | null;
  providerName: string | null;
  serviceName: string | null;
  scheduledAt: string | null;
};

const COPY: Record<
  string,
  { subject: string; heading: string; body: string; ctaLabel?: string }
> = {
  new_provider_request: {
    subject: "New College Crew job request",
    heading: "You have a new request",
    body: "Review the job and respond before the customer’s response window closes.",
  },
  counter_offer_received: {
    subject: "Your College Crew student suggested a different time",
    heading: "A different time was suggested",
    body: "Your student can’t make the time you picked and suggested another one. Accept it or turn it down — you’re not charged either way until you accept.",
    ctaLabel: "Review the new time",
  },
  reschedule_provider_new_suggestion: {
    subject: "A customer suggested a new College Crew time",
    heading: "A new time was suggested",
    body: "Your customer suggested another time for this job. Review it in your booking chat and accept, decline, or suggest a different time.",
    ctaLabel: "Open scheduling chat",
  },
  reschedule_provider_reminder: {
    subject: "Reminder: a College Crew time suggestion is waiting",
    heading: "A scheduling response is waiting",
    body: "Your customer suggested a new time two hours ago. There is no deadline, but responding helps get the job scheduled.",
    ctaLabel: "Open scheduling chat",
  },
  quote_counter_options: {
    subject: "Your College Crew student offered other dates",
    heading: "Choose a new date window",
    body: "Your student offered up to three other date windows. Choose one before the options expire, or find another provider.",
    ctaLabel: "Review date options",
  },
  quote_option_selected: {
    subject: "A customer selected your College Crew date option",
    heading: "Finish the quote",
    body: "The customer selected one of your date windows. Set the exact start time and send the fixed quote before the new response deadline.",
    ctaLabel: "Finish the quote",
  },
  request_declined: {
    subject: "College Crew request update",
    heading: "The provider declined this request",
    body: "You can return to your dashboard to review the request and find another provider.",
  },
  request_withdrawn: {
    subject: "College Crew request withdrawn",
    heading: "The customer chose another provider",
    body: "This request has been withdrawn and no action is needed.",
  },
  request_start_expired: {
    subject: "College Crew request expired",
    heading: "The request expired",
    body: "The scheduled start arrived before the request was booked.",
  },
  payment_expired: {
    subject: "College Crew payment window expired",
    heading: "The booking hold was released",
    body: "The first-hour payment deadline passed, so the reserved time is available again.",
  },
  response_alert: {
    subject: "Still waiting on your College Crew request",
    heading: "Your provider has not responded yet",
    body: "You can keep waiting or send one replacement request from your dashboard.",
  },
  booked_first_hour_receipt: {
    subject: "College Crew booking confirmed",
    heading: "Your job is booked",
    body: "Your first-hour payment succeeded and the provider’s time is reserved.",
  },
  quote_deposit_due: {
    subject: "Your College Crew quote is ready",
    heading: "Review your final quote",
    body: "Accept the fixed quote and pay the 20% deposit before the payment window closes to reserve the provider’s time.",
    ctaLabel: "Review and pay deposit",
  },
  quote_deposit_receipt: {
    subject: "College Crew booking confirmed",
    heading: "Your job is booked",
    body: "Your 20% deposit succeeded and the provider’s time is reserved. The fixed remaining balance is due after the job.",
  },
  quote_deposit_booked_job: {
    subject: "College Crew quote booking confirmed",
    heading: "The customer accepted your quote",
    body: "The 20% deposit is paid and held by College Crew, and this job is now on your schedule.",
  },
  booked_job: {
    subject: "College Crew job confirmed",
    heading: "The customer confirmed the booking",
    body: "The first hour is paid and this job is now on your schedule.",
  },
  booking_cancelled_customer: {
    subject: "College Crew cancellation update",
    heading: "The booking was cancelled",
    body: "Review the cancellation and any refund status in your dashboard.",
  },
  booking_cancelled_provider: {
    subject: "College Crew cancellation update",
    heading: "The booking was cancelled",
    body: "Review the cancellation details in your dashboard.",
  },
  booking_cancelled_admin: {
    subject: "College Crew operations: booking cancelled",
    heading: "A booking was cancelled",
    body: "Review the booking and any refund obligation in founder operations.",
  },
  refund_succeeded: {
    subject: "Your College Crew refund was processed",
    heading: "Refund processed",
    body: "The refund was submitted successfully. Your bank may take additional time to post it.",
  },
  refund_failed: {
    subject: "College Crew refund needs attention",
    heading: "Your refund is still being resolved",
    body: "The automatic refund did not complete. College Crew operations has been notified.",
  },
  provider_arrived: {
    subject: "Your College Crew provider arrived",
    heading: "Work has started",
    body: "Your provider marked the job as Arrived. You can follow its status from your dashboard.",
  },
  provider_en_route: {
    subject: "Your College Crew provider is on the way",
    heading: "Your provider is on the way",
    body: "Your provider sent an on-my-way update. Follow the booking from your dashboard.",
  },
  invoice_submitted: {
    subject: "Your College Crew invoice is ready",
    heading: "Review your final invoice",
    body: "The provider submitted completed time. Review or dispute it before the countdown ends.",
  },
  final_payment_success: {
    subject: "College Crew final payment complete",
    heading: "The job is complete",
    body: "The remaining balance was paid successfully. Rate your provider whenever you’re ready — your review helps students build a trusted track record.",
    ctaLabel: "Rate your provider",
  },
  job_completed_paid: {
    subject: "College Crew job complete",
    heading: "Final payment succeeded",
    body: "The customer’s remaining balance was paid and the job is complete.",
  },
  final_payment_action_required: {
    subject: "Action needed for your College Crew payment",
    heading: "Finish your final payment",
    body: "The saved card could not complete the final payment automatically. Use the secure dashboard flow to recover it.",
  },
  final_payment_failed: {
    subject: "Your College Crew final payment failed",
    heading: "Your final payment needs attention",
    body: "The saved card was declined. Use the secure dashboard flow to complete the remaining balance.",
  },
  failed_charge_admin: {
    subject: "College Crew operations: charge needs attention",
    heading: "A final charge needs review",
    body: "Review the failed or action-required balance payment in founder operations.",
  },
  failed_refund_admin: {
    subject: "College Crew operations: refund failed",
    heading: "A refund needs review",
    body: "Review and safely retry the failed refund from founder operations.",
  },
  dispute_opened: {
    subject: "College Crew dispute opened",
    heading: "A dispute is under review",
    body: "College Crew operations has been notified. Updates will appear in your dashboard.",
  },
  dispute_resolved: {
    subject: "College Crew dispute resolved",
    heading: "The dispute was resolved",
    body: "Review the resolution and resulting booking status in your dashboard.",
  },
  dispute_opened_admin: {
    subject: "College Crew operations: dispute opened",
    heading: "A booking dispute needs review",
    body: "Review the dispute in founder operations. No automated resolution has been applied.",
  },
  card_dispute_admin: {
    subject: "College Crew operations: external Stripe dispute",
    heading: "A card-network dispute changed",
    body: "Review the external Stripe dispute in founder operations and Stripe.",
  },
  scheduler_failure_admin: {
    subject: "College Crew operations: scheduler failure",
    heading: "Automation needs review",
    body: "A booking automation task reached terminal failure. Review and retry it in founder operations.",
  },
  payout_after_dispute_admin: {
    subject: "College Crew operations: dispute on an already-paid booking",
    heading: "A dispute landed after the payout",
    body: "The provider payout for this booking had already been transferred when the dispute arrived, so it could not be held. Recovering the funds needs manual follow-up with the provider.",
  },
};

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function dashboardPath(context: BookingEmailContext) {
  if (context.template === "response_alert" && context.bookingId) {
    return `/bookings/${encodeURIComponent(context.bookingId)}/replace`;
  }
  if (
    ["counter_offer_received", "quote_counter_options"].includes(
      context.template,
    ) &&
    context.bookingId
  ) {
    return `/bookings/${encodeURIComponent(context.bookingId)}/counter`;
  }
  if (
    ["reschedule_provider_new_suggestion", "reschedule_provider_reminder"].includes(
      context.template,
    ) &&
    context.bookingId
  ) {
    return `/messages`; // The booking-specific thread is available from the inbox.
  }
  if (context.template === "final_payment_success" && context.bookingId) {
    return `/dashboard#booking-${encodeURIComponent(context.bookingId)}`;
  }
  if (context.template.endsWith("_admin")) return "/admin/operations";
  if (context.recipientKind === "provider") return "/provider/dashboard";
  return "/dashboard";
}

function formatStart(value: string | null) {
  if (!value) return null;
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Chicago",
  }).format(new Date(value));
}

/** Email links always point at the web app; there is no Vercel env here. */
function getPublicSiteUrl() {
  const raw = Deno.env.get("PUBLIC_SITE_URL")?.trim() || "";
  const normalized = raw.replace(/\/+$/, "");
  if (!normalized) return "https://thecollegecrew.com";
  if (/^https?:\/\//i.test(normalized)) return normalized;
  return `https://${normalized}`;
}

function sanitizeEmailDiagnostic(value: string | null | undefined) {
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

async function activeSuppression(recipientEmail: string) {
  const admin = createAdminClient();
  const result = await admin.rpc("get_active_email_suppression", {
    p_recipient_email: recipientEmail,
  });
  if (result.error) {
    return {
      errorClass: "EmailSuppressionCheckFailed",
      error: "Email suppression state could not be checked.",
    };
  }
  const suppression = (result.data?.[0] ?? null) as { reason?: string } | null;
  if (!suppression) return null;
  return {
    errorClass: "RecipientSuppressed",
    error: `Recipient is suppressed (${suppression.reason ?? "provider"}).`,
  };
}

async function sendEmail(opts: {
  to: string;
  subject: string;
  text: string;
  html: string;
  idempotencyKey: string;
}): Promise<SendResult> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) {
    // Booking automation must never emit recipients or bodies into logs.
    console.info("[email:stub]", {
      event: "delivery_stubbed",
      idempotencyKey: opts.idempotencyKey,
    });
    return {
      ok: false,
      errorClass: "EmailProviderUnconfigured",
      error: "Email provider is not configured.",
    };
  }

  const from = Deno.env.get("EMAIL_FROM")?.trim();
  if (!from) {
    return {
      ok: false,
      errorClass: "EmailSenderUnconfigured",
      error: "EMAIL_FROM is not configured.",
    };
  }

  const suppression = await activeSuppression(opts.to);
  if (suppression) return { ok: false, ...suppression };

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": opts.idempotencyKey,
    },
    body: JSON.stringify({
      from,
      to: opts.to,
      subject: opts.subject,
      text: opts.text,
      html: opts.html,
    }),
  });
  if (!response.ok) {
    const providerError = (await response.json().catch(() => null)) as {
      name?: string;
      message?: string;
    } | null;
    const name = providerError?.name
      ?.replace(/[^a-zA-Z0-9_.-]/g, "_")
      .slice(0, 80);
    return {
      ok: false,
      errorClass: name ? `Resend_${name}` : `ResendHttp${response.status}`,
      error:
        sanitizeEmailDiagnostic(providerError?.message) ??
        `Resend rejected the email with HTTP ${response.status}.`,
    };
  }
  const data = (await response.json().catch(() => null)) as { id?: string } | null;
  return { ok: true, providerMessageId: data?.id };
}

/** Deliver one already-committed outbox item with a provider idempotency key. */
export function sendBookingEmail(context: BookingEmailContext): Promise<SendResult> {
  const copy = COPY[context.template] ?? {
    subject: "College Crew booking update",
    heading: "Your booking has an update",
    body: "Open your dashboard for the latest status.",
  };
  const start = formatStart(context.scheduledAt);
  const summary = [context.serviceName, start ? `${start} CT` : null]
    .filter(Boolean)
    .join(" · ");
  const url = `${getPublicSiteUrl()}${dashboardPath(context)}`;
  const text = [
    copy.heading,
    "",
    copy.body,
    summary ? `\n${summary}` : "",
    "",
    `Open College Crew: ${url}`,
    "",
    "College Crew · Neighbors hiring verified college students.",
  ].join("\n");
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;background:#f7f5f1;color:#2a3a37;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;background:#fffdf8;border:1px solid #d7d1c3;border-radius:12px">
<tr><td style="padding:32px"><p style="margin:0 0 20px;font-family:Georgia,serif;font-weight:700;color:#344945">College Crew</p>
<h1 style="margin:0 0 14px;font:700 28px/1.2 Georgia,serif">${escapeHtml(copy.heading)}</h1>
<p style="margin:0 0 16px;font-size:16px;line-height:1.6">${escapeHtml(copy.body)}</p>
${summary ? `<p style="margin:0 0 22px;color:#66736f">${escapeHtml(summary)} CT</p>` : ""}
<a href="${escapeHtml(url)}" style="display:inline-block;padding:12px 18px;border-radius:8px;background:#344945;color:#fff;text-decoration:none;font-weight:700">${escapeHtml(copy.ctaLabel ?? "Open dashboard")}</a>
</td></tr></table></td></tr></table></body></html>`;

  return sendEmail({
    to: context.recipientEmail,
    subject: copy.subject,
    text,
    html,
    idempotencyKey: context.eventKey,
  });
}
