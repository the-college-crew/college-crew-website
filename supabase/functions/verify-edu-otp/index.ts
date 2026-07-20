// verify-edu-otp — redeem the 6-digit code issued by issue-edu-otp and record
// the verified school email. Contract of record:
// packages/core/src/contracts/edge.ts (verifyEduOtp*).
//
// Port of verifySchoolEmailOtp
// (apps/web/app/(provider)/provider/onboarding/actions.ts):
//
//   load the caller's pending provider_email_verifications row, enforce expiry
//   and the attempt ceiling, hash-compare the code, and on a match upsert
//   provider_school_emails (verified) and clear the pending row. A miss
//   increments attempts; the expected failure states surface as typed error
//   envelopes (the mobile client retries or re-requests on each code).
//
// Expiry / attempt-ceiling / hash scheme are identical to the web action, so a
// code issued on either surface redeems on the other. verify_jwt stays ON.
// Secrets: SUPABASE_SERVICE_ROLE_KEY (both tables are service-role only).

import { createClient } from "npm:@supabase/supabase-js@2";
import { createHash } from "node:crypto";

const MAX_ATTEMPTS = 5;

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

/** Codes are stored hashed and salted with the user id — never in the clear. */
function hashCode(userId: string, code: string): string {
  return createHash("sha256").update(`${userId}:${code}`).digest("hex");
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
    const code = typeof body?.code === "string" ? body.code.trim() : "";
    if (!/^\d{6}$/.test(code)) {
      return fail("bad_request", "Enter the 6-digit code from your email.", 400);
    }

    const admin = createClient<any>(
      Deno.env.get("SUPABASE_URL")!,
      serviceKey,
    );

    const { data: row } = await admin
      .from("provider_email_verifications")
      .select("email, code_hash, attempts, expires_at")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!row) {
      return fail("no_pending_code", "No code to verify — request one first.", 409);
    }

    const clear = () =>
      admin
        .from("provider_email_verifications")
        .delete()
        .eq("user_id", user.id);

    if (new Date(row.expires_at).getTime() < Date.now()) {
      await clear();
      return fail("code_expired", "That code expired — request a new one.", 409);
    }
    if (row.attempts >= MAX_ATTEMPTS) {
      await clear();
      return fail("too_many_attempts", "Too many attempts — request a new code.", 429);
    }
    if (hashCode(user.id, code) !== row.code_hash) {
      await admin
        .from("provider_email_verifications")
        .update({ attempts: row.attempts + 1 })
        .eq("user_id", user.id);
      return fail(
        "invalid_code",
        "That code isn’t right. Check your email and try again.",
        401,
      );
    }

    const { error: saveError } = await admin
      .from("provider_school_emails")
      .upsert({
        user_id: user.id,
        email: row.email,
        verified_at: new Date().toISOString(),
      });
    if (saveError) {
      // 23505 => someone else verified this .edu between send and now.
      if ((saveError as { code?: string }).code === "23505") {
        return fail(
          "email_taken",
          "That school email is already linked to another account.",
          409,
        );
      }
      return fail("save_failed", "Could not save verification — try again.", 409);
    }
    await clear();

    return json({ verified: true });
  } catch (cause) {
    console.error("verify-edu-otp failed:", cause);
    return fail("internal", "Unexpected verification error.", 500);
  }
});
