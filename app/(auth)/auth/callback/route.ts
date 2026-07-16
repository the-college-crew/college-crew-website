import { NextResponse } from "next/server";

import { postAuthDestination, safeNext } from "@/lib/auth/post-auth";
import { createClient } from "@/lib/supabase/server";

/**
 * Auth callback: the URL every Supabase email link points at.
 *
 * The `token_hash` OTP is single-use, and it is NOT spent here. Corporate mail
 * scanners (Outlook Safe Links, Defender, and friends) fetch every link in an
 * inbound message before the recipient ever sees it — a GET that redeems the
 * token hands the confirmation to the scanner, marks the account confirmed, and
 * leaves the human staring at "link invalid or expired" with no way back:
 * Supabase then refuses to resend, because the account is already confirmed.
 * So we hand off to /auth/confirm, which spends the token only on a POST.
 * Scanners follow links; they don't submit forms.
 *
 * The PKCE `code` flow is safe to exchange inline — the code is worthless
 * without the verifier cookie held by the browser that started the flow, so a
 * scanner cannot spend it.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  const next = safeNext(searchParams.get("next"));

  if (tokenHash && type) {
    const params = new URLSearchParams({ token_hash: tokenHash, type, next });
    return NextResponse.redirect(`${origin}/auth/confirm?${params}`);
  }

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${await postAuthDestination(next)}`);
    }
  }

  // No usable token. Route to a surface that can issue a fresh one.
  const isRecovery = type === "recovery" || next === "/reset-password";
  if (isRecovery) {
    return NextResponse.redirect(
      `${origin}/forgot-password?error=${encodeURIComponent(
        "That reset link has expired. Request a new one below.",
      )}`,
    );
  }

  return NextResponse.redirect(
    `${origin}/verify-email?error=${encodeURIComponent(
      "That confirmation link is invalid or expired. Send yourself a new one below.",
    )}`,
  );
}
