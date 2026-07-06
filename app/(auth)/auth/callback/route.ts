import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

/**
 * Auth callback: handles Supabase email links — both the PKCE `code` flow and
 * the `token_hash` OTP flow — for signup confirmation and password recovery,
 * then lands the user on `next`.
 *
 * On failure we never dead-end: a recovery link sends the user to
 * /forgot-password to request a fresh one; a signup link sends them to
 * /verify-email to resend the confirmation.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const nextParam = searchParams.get("next");
  const next = nextParam?.startsWith("/") ? nextParam : "/";

  const supabase = await createClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${next}`);
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash: tokenHash,
    });
    if (!error) return NextResponse.redirect(`${origin}${next}`);
  }

  // Failed / expired link. Route to a recovery surface, not a dead end.
  const isRecovery = type === "recovery" || next === "/reset-password";
  if (isRecovery) {
    return NextResponse.redirect(
      `${origin}/forgot-password?error=${encodeURIComponent(
        "That reset link has expired — request a new one below.",
      )}`,
    );
  }

  return NextResponse.redirect(
    `${origin}/verify-email?error=${encodeURIComponent(
      "That confirmation link is invalid or expired — send yourself a new one below.",
    )}`,
  );
}
