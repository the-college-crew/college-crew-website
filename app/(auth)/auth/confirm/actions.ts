"use server";

import type { EmailOtpType } from "@supabase/supabase-js";
import { redirect } from "next/navigation";

import { postAuthDestination, safeNext } from "@/lib/auth/post-auth";
import { hasSupabaseEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export type ConfirmFormState = { error?: string };

/**
 * Spend the single-use email token. Deliberately a POST-only server action:
 * this is the step mail scanners can't perform, which is what keeps the token
 * alive until the human actually clicks (see the auth callback route).
 */
export async function confirmEmailLink(
  _prev: ConfirmFormState,
  formData: FormData,
): Promise<ConfirmFormState> {
  if (!hasSupabaseEnv()) {
    return { error: "Supabase isn't configured yet." };
  }

  const tokenHash = formData.get("token_hash");
  const rawType = formData.get("type");
  const next = safeNext(
    typeof formData.get("next") === "string"
      ? (formData.get("next") as string)
      : null,
  );

  if (typeof tokenHash !== "string" || typeof rawType !== "string") {
    return { error: "That link is missing its token — request a new email." };
  }
  const type = rawType as EmailOtpType;

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({
    type,
    token_hash: tokenHash,
  });

  if (error) {
    // Dead token. Send them somewhere that can mint a fresh one.
    redirect(
      type === "recovery" || next === "/reset-password"
        ? `/forgot-password?error=${encodeURIComponent(
            "That reset link has expired — request a new one below.",
          )}`
        : `/verify-email?error=${encodeURIComponent(
            "That confirmation link is invalid or expired — send yourself a new one below.",
          )}`,
    );
  }

  redirect(await postAuthDestination(next));
}
