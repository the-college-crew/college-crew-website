import "server-only";

import type { ProfileTextField } from "@/lib/db/types";
import { sanitizeEmailDiagnostic } from "@/lib/email/resend-webhooks";
import { hasResendEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Transactional email: the provider .edu verification code, plus the founder
 * notice when profile text is flagged. Resend is optional infra: with no
 * RESEND_API_KEY we log to the server console instead of sending, so both flows
 * are testable in dev before the Resend account exists. Swapping in live email
 * is just setting the two env vars — no code change here.
 *
 * server-only: never bundle the API key path into the browser.
 */

export type SendResult =
  | { ok: true; providerMessageId?: string }
  | { ok: false; errorClass: string; error: string };

function providerErrorClass(error: unknown) {
  if (!error || typeof error !== "object") return "ResendRejected";
  const name = "name" in error && typeof error.name === "string" ? error.name : "";
  const normalized = name.replace(/[^a-zA-Z0-9_.-]/g, "_").slice(0, 80);
  return normalized ? `Resend_${normalized}` : "ResendRejected";
}

type RecipientFilterResult =
  | { ok: true; recipients: string[] }
  | { ok: false; errorClass: string; error: string };

async function filterSuppressedRecipients(
  recipients: string[],
): Promise<RecipientFilterResult> {
  const admin = createAdminClient();
  const allowed: string[] = [];
  for (const recipient of [...new Set(recipients.map((value) => value.trim().toLowerCase()))]) {
    const result = await admin.rpc("get_active_email_suppression", {
      p_recipient_email: recipient,
    });
    if (result.error) {
      return {
        ok: false,
        errorClass: "EmailSuppressionCheckFailed",
        error: "Email suppression state could not be checked.",
      };
    }
    const suppression = result.data?.[0];
    if (!suppression) allowed.push(recipient);
  }
  if (allowed.length > 0) return { ok: true, recipients: allowed };
  return {
    ok: false,
    errorClass: "RecipientSuppressed",
    error: "All recipients are suppressed.",
  };
}

export async function sendEmail(opts: {
  to: string | string[];
  subject: string;
  text: string;
  html?: string;
  idempotencyKey?: string;
  /** Booking automation must never emit recipients or bodies into logs. */
  redactedLog?: boolean;
  /** Durable outbox delivery must retry instead of treating a stub as sent. */
  requireProvider?: boolean;
}): Promise<SendResult> {
  if (!hasResendEnv()) {
    if (opts.redactedLog) {
      console.info("[email:stub]", {
        event: "delivery_stubbed",
        idempotencyKey: opts.idempotencyKey,
        recipientCount: [opts.to].flat().length,
      });
    } else {
      // School verification remains locally testable without Resend.
      console.info(
        `[email:stub] To: ${[opts.to].flat().join(", ")}\nSubject: ${opts.subject}\n${opts.text}`,
      );
      if (opts.html) {
        console.info(`[email:stub:html]\n${opts.html}`);
      }
    }
    if (opts.requireProvider) {
      return {
        ok: false,
        errorClass: "EmailProviderUnconfigured",
        error: "Email provider is not configured.",
      };
    }
    return { ok: true };
  }

  const from = process.env.EMAIL_FROM?.trim();
  if (!from) {
    return {
      ok: false,
      errorClass: "EmailSenderUnconfigured",
      error: "EMAIL_FROM is not configured.",
    };
  }

  const recipientCheck = await filterSuppressedRecipients([opts.to].flat());
  if (!recipientCheck.ok) return recipientCheck;

  // Loaded lazily so the dependency is only touched when a key is present.
  const { Resend } = await import("resend");
  const resend = new Resend(process.env.RESEND_API_KEY);
  const { data, error } = await resend.emails.send(
    {
      from,
      to: recipientCheck.recipients,
      subject: opts.subject,
      text: opts.text,
      ...(opts.html ? { html: opts.html } : {}),
    },
    opts.idempotencyKey ? { idempotencyKey: opts.idempotencyKey } : undefined,
  );
  if (error) {
    return {
      ok: false,
      errorClass: providerErrorClass(error),
      error: sanitizeEmailDiagnostic(error.message) ?? "Resend rejected the email.",
    };
  }
  return { ok: true, providerMessageId: data?.id };
}

export function getPublicSiteUrl() {
  const raw =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim() ||
    process.env.VERCEL_URL?.trim() ||
    "http://127.0.0.1:3000";

  const normalized = raw.replace(/\/+$/, "");
  if (/^https?:\/\//i.test(normalized)) {
    return normalized;
  }
  return `https://${normalized}`;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function schoolOtpHtml(code: string) {
  const logoUrl = `${getPublicSiteUrl()}/college-crew-mark.png`;
  const escapedCode = escapeHtml(code);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>Your College Crew verification code</title>
</head>
<body style="margin:0; padding:0; background-color:#f7f5f1; -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%;">
  <div style="display:none; max-height:0; overflow:hidden; font-size:1px; line-height:1px; color:#f7f5f1; opacity:0;">
    Use this code to verify your student email for College Crew.
  </div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f7f5f1;">
    <tr>
      <td align="center" style="padding:34px 16px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px; max-width:600px; background-color:#fffdf8; border:1px solid #d7d1c3; border-radius:12px; overflow:hidden;">
          <tr>
            <td style="padding:0; font-size:0; line-height:0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td width="50%" height="6" style="background-color:#344945; font-size:0; line-height:0;">&nbsp;</td>
                  <td width="25%" height="6" style="background-color:#e4e3bc; font-size:0; line-height:0;">&nbsp;</td>
                  <td width="25%" height="6" style="background-color:#d5e3e8; font-size:0; line-height:0;">&nbsp;</td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:34px 40px 8px 40px;">
              <img src="${logoUrl}" width="72" height="66" alt="College Crew" style="display:block; width:72px; height:auto; margin:0 auto 14px auto; border:0; outline:none; text-decoration:none;">
              <p style="margin:0; font-family:Georgia,'Times New Roman',serif; font-size:24px; font-weight:bold; line-height:1.15; color:#344945; text-align:center;">College Crew</p>
            </td>
          </tr>
          <tr>
            <td style="padding:18px 40px 0 40px;">
              <h1 style="margin:0 0 14px 0; font-family:Georgia,'Times New Roman',serif; font-size:28px; line-height:1.2; font-weight:bold; color:#2a3a37; text-align:center;">Verify your student email</h1>
              <p style="margin:0 0 22px 0; font-family:-apple-system,'Segoe UI',Arial,sans-serif; font-size:16px; line-height:1.6; color:#344945; text-align:center;">
                Enter this code on the verification step to confirm your school email.
              </p>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:0 40px;">
              <div style="display:inline-block; border:1px solid #d7d1c3; border-radius:10px; background-color:#f7f5f1; padding:16px 24px; font-family:'SFMono-Regular',Consolas,'Liberation Mono',monospace; font-size:30px; font-weight:bold; letter-spacing:8px; color:#2a3a37;">
                ${escapedCode}
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 40px 0 40px;">
              <p style="margin:0; font-family:-apple-system,'Segoe UI',Arial,sans-serif; font-size:13px; line-height:1.6; color:#66736f; text-align:center;">
                This code expires in 15 minutes. If you did not request it, you can safely ignore this email.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 40px 0 40px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td height="1" style="background-color:#d7d1c3; font-size:0; line-height:0;">&nbsp;</td></tr></table>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 40px 36px 40px;">
              <p style="margin:0 0 4px 0; font-family:Georgia,'Times New Roman',serif; font-size:14px; font-weight:bold; color:#2a3a37; text-align:center;">College Crew</p>
              <p style="margin:0; font-family:-apple-system,'Segoe UI',Arial,sans-serif; font-size:12px; line-height:1.5; color:#66736f; text-align:center;">
                Neighbors hiring verified college students, right down the street.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Founder notice: a provider's bio or display name tripped the profile scan
 * (lib/moderation/profile-text.ts). Moderation is flag-only, so the text is
 * ALREADY LIVE on the public profile — this email exists so the founders find
 * out without having to watch the dashboard. Mirrors the flag email that
 * moderate-message sends for chat.
 */
const FOUNDER_NOTIFY = ["Ari@thecollegecrew.com", "zach@thecollegecrew.com"];

const FIELD_LABEL: Record<ProfileTextField, string> = {
  display_name: "display name",
  bio: "bio",
  company_name: "company name",
  school_name: "school name",
  greek_organization: "Greek-life organization",
};

export function sendProfileFlagEmail(opts: {
  field: ProfileTextField;
  matched: string[];
  text: string;
  userId: string;
}): Promise<SendResult> {
  const label = FIELD_LABEL[opts.field];
  return sendEmail({
    to: FOUNDER_NOTIFY,
    subject: `College Crew: a provider ${label} was flagged`,
    text: [
      `A provider's ${label} tripped the profile scan. It is LIVE on their public profile — flagging does not block it.`,
      "",
      `What matched: ${opts.matched.join(", ")}`,
      `Provider (user id): ${opts.userId}`,
      "",
      `Flagged ${label}:`,
      opts.text,
      "",
      "Review it in the admin dashboard → Flagged, under 'Flagged profiles'. You can edit or clear the text there.",
    ].join("\n"),
  });
}

/** Email a provider their 6-digit school-email verification code. */
export function sendSchoolOtpEmail(to: string, code: string): Promise<SendResult> {
  return sendEmail({
    to,
    subject: "Your College Crew verification code",
    text: [
      `Your College Crew school-email verification code is: ${code}`,
      "",
      "Enter it on the verification step to confirm your student email.",
      "This code expires in 15 minutes. If you didn't request it, ignore this email.",
    ].join("\n"),
    html: schoolOtpHtml(code),
    // Prod must fail loudly if Resend is unconfigured — otherwise the action
    // records a code and shows "we sent it" while nothing was emailed. Dev
    // keeps the stub (code logged to console) so onboarding stays testable
    // without a Resend key.
    requireProvider: process.env.NODE_ENV === "production",
  });
}
