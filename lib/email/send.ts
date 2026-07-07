import "server-only";

import { hasResendEnv } from "@/lib/env";

/**
 * Transactional email. The only sender for now is the provider .edu
 * verification code. Resend is optional infra: with no RESEND_API_KEY we log
 * the code to the server console instead of sending, so the whole OTP flow is
 * testable in dev before the Resend account exists. Swapping in live email is
 * just setting the two env vars — no code change here.
 *
 * server-only: never bundle the API key path into the browser.
 */

// `??` alone would keep an empty/blank EMAIL_FROM ("") — which Resend rejects
// as an invalid `from`. Trim and fall back on any blank value, not just unset.
const FROM =
  process.env.EMAIL_FROM?.trim() || "College Crew <onboarding@resend.dev>";

type SendResult = { ok: true } | { ok: false; error: string };

async function sendEmail(opts: {
  to: string;
  subject: string;
  text: string;
}): Promise<SendResult> {
  if (!hasResendEnv()) {
    // Dev/stub path: no provider configured. Surface the content in logs so a
    // developer can complete the flow locally.
    console.info(
      `[email:stub] To: ${opts.to}\nSubject: ${opts.subject}\n${opts.text}`,
    );
    return { ok: true };
  }

  // Loaded lazily so the dependency is only touched when a key is present.
  const { Resend } = await import("resend");
  const resend = new Resend(process.env.RESEND_API_KEY);
  const { error } = await resend.emails.send({
    from: FROM,
    to: opts.to,
    subject: opts.subject,
    text: opts.text,
  });
  if (error) {
    return { ok: false, error: error.message };
  }
  return { ok: true };
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
  });
}
