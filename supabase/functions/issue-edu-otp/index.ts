// issue-edu-otp — send (or resend) the 6-digit school-email verification code
// for provider onboarding on mobile. Contract of record:
// packages/core/src/contracts/edge.ts (issueEduOtp*).
//
// Port of sendSchoolEmailOtp
// (apps/web/app/(provider)/provider/onboarding/actions.ts):
//
//   1. verify the caller is signed in (verify_jwt is ON) and re-derive the
//      user from the JWT;
//   2. validate the address is a .edu (lowercased, trimmed);
//   3. anti-sharing — a verified .edu belongs to exactly one provider, so a
//      pending code is refused if another account already verified it;
//   4. throttle resends (60s) off provider_email_verifications.created_at;
//   5. SEND FIRST via Resend — a failed delivery must not persist a code or
//      burn the resend cooldown — then upsert the pending row.
//
// The code is stored ONLY as sha256(`${userId}:${code}`) in
// provider_email_verifications (service-role only; no browser grant). The hash
// scheme is byte-identical to the web action, so a code issued on either
// surface verifies on the other.
//
// verify_jwt stays ON (platform default). Secrets: SUPABASE_SERVICE_ROLE_KEY
// (the pending/verified tables are service-role only), RESEND_API_KEY +
// EMAIL_FROM. A configured provider without EMAIL_FROM fails closed.

import { createClient } from "npm:@supabase/supabase-js@2";
import { createHash, randomInt } from "node:crypto";

const OTP_TTL_MS = 15 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const json = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const fail = (code: string, message: string, status: number) =>
  json({ error: { code, message } }, status);

/** Mirrors schoolEmailSchema (lib/validation/auth.ts): a .edu, lowercased. */
function parseSchoolEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const email = raw.trim().toLowerCase();
  // Same shape the web emailSchema accepts; the .edu suffix is the real gate.
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return null;
  if (!email.endsWith(".edu")) return null;
  return email;
}

/** Codes are stored hashed and salted with the user id — never in the clear. */
function hashCode(userId: string, code: string): string {
  return createHash("sha256").update(`${userId}:${code}`).digest("hex");
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/** Branded OTP email — mirrors schoolOtpHtml in apps/web/lib/email/send.ts so
 * the code looks identical whether it was requested on web or mobile. */
function schoolOtpHtml(code: string): string {
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

/** Deliver the code. No RESEND_API_KEY (dev) → log and report sent, exactly
 * like the web sendEmail stub, so onboarding stays testable without Resend. */
async function sendOtpEmail(
  to: string,
  code: string,
  admin: ReturnType<typeof createClient<any>>,
): Promise<{ ok: boolean; error?: string }> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) {
    console.info(`[email:stub] To: ${to}  code: ${code}`);
    return { ok: true };
  }
  const from = Deno.env.get("EMAIL_FROM")?.trim();
  if (!from) {
    return { ok: false, error: "EMAIL_FROM is not configured." };
  }
  const suppression = await admin.rpc("get_active_email_suppression", {
    p_recipient_email: to,
  });
  if (suppression.error) {
    return { ok: false, error: "Email suppression state could not be checked." };
  }
  if (suppression.data?.length) {
    return { ok: false, error: "That address cannot receive College Crew email." };
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to,
        subject: "Your College Crew verification code",
        text: [
          `Your College Crew school-email verification code is: ${code}`,
          "",
          "Enter it on the verification step to confirm your student email.",
          "This code expires in 15 minutes. If you didn't request it, ignore this email.",
        ].join("\n"),
        html: schoolOtpHtml(code),
      }),
    });
    if (!res.ok) {
      const detail = (await res.json().catch(() => null)) as {
        name?: string;
      } | null;
      return {
        ok: false,
        error: detail?.name
          ? `Resend rejected the email (${detail.name}).`
          : `Resend rejected the email (HTTP ${res.status}).`,
      };
    }
    return { ok: true };
  } catch (cause) {
    return { ok: false, error: String(cause) };
  }
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return fail("method_not_allowed", "Use POST.", 405);
  }

  try {
    const authHeader = request.headers.get("Authorization");
    if (!authHeader) return fail("not_signed_in", "Not signed in.", 401);

    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!serviceKey) {
      return fail("unconfigured", "Email verification isn’t configured yet.", 503);
    }

    const userClient = createClient<any>(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const {
      data: { user },
    } = await userClient.auth.getUser();
    if (!user) return fail("not_signed_in", "Not signed in.", 401);

    const body = await request.json().catch(() => null);
    const email = parseSchoolEmail(body?.schoolEmail);
    if (!email) {
      return fail(
        "bad_request",
        "Use your school email; it must end in .edu.",
        400,
      );
    }

    // The pending/verified tables have no browser grant — service role only.
    const admin = createClient<any>(
      Deno.env.get("SUPABASE_URL")!,
      serviceKey,
    );

    // Anti-sharing: a verified .edu belongs to exactly one provider.
    const { data: taken } = await admin
      .from("provider_school_emails")
      .select("user_id")
      .eq("email", email)
      .maybeSingle();
    if (taken && taken.user_id !== user.id) {
      return fail(
        "email_taken",
        "That school email is already linked to another account.",
        409,
      );
    }

    // Throttle resends so the inbox (and our sender) isn't hammered.
    const { data: existing } = await admin
      .from("provider_email_verifications")
      .select("created_at")
      .eq("user_id", user.id)
      .maybeSingle();
    if (
      existing &&
      Date.now() - new Date(existing.created_at).getTime() < RESEND_COOLDOWN_MS
    ) {
      return fail(
        "cooldown",
        "Give it a moment before requesting another code.",
        429,
      );
    }

    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");

    // Send FIRST: a failed delivery must not persist a code or burn the resend
    // cooldown (the cooldown reads created_at on the row written below).
    const sent = await sendOtpEmail(email, code, admin);
    if (!sent.ok) {
      return fail("send_failed", `Could not send the code: ${sent.error}`, 502);
    }

    const { error: upsertError } = await admin
      .from("provider_email_verifications")
      .upsert({
        user_id: user.id,
        email,
        code_hash: hashCode(user.id, code),
        attempts: 0,
        expires_at: new Date(Date.now() + OTP_TTL_MS).toISOString(),
        created_at: new Date().toISOString(),
      });
    if (upsertError) {
      return fail("begin_failed", "Could not start verification — try again.", 409);
    }

    return json({ ok: true });
  } catch (cause) {
    console.error("issue-edu-otp failed:", cause);
    return fail("internal", "Unexpected verification error.", 500);
  }
});
