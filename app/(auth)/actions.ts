"use server";

import type { AuthError } from "@supabase/supabase-js";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getAccountShape } from "@/lib/auth/post-auth";
import { homePathFor } from "@/lib/auth/session";
import { hasServiceRoleEnv, hasSupabaseEnv } from "@/lib/env";
import { geocodeProfileAddress } from "@/lib/geocode/profile";
import {
  hasAcceptedCurrentMasterAgreement,
  masterAgreementPath,
  requiredMasterVariant,
} from "@/lib/legal/acceptance";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  customerSignUpSchema,
  emailSchema,
  providerSignUpSchema,
  resetPasswordSchema,
} from "@/lib/validation/auth";

/**
 * Shared auth actions (auth is shared ownership — coordinate changes).
 * Unified accounts: every signup creates the same base account (admins come
 * only from the allowlist inside handle_new_user). "Provider" is a capability
 * added later by onboarding. signup_intent metadata records which door the
 * user came in through — used ONLY to route confirmation emails, never for
 * authorization. DOB + address ride in as metadata and are persisted by the
 * handle_new_user trigger.
 */

export type AuthFormState = {
  error?: string;
  success?: string;
  /** Set on a successful signup so the "check your email" panel can resend. */
  email?: string;
  /**
   * The address is already confirmed, so no email was sent (nor could one be).
   * Surfaces point the user at login instead of leaving them waiting.
   */
  alreadyConfirmed?: boolean;
};

const NOT_CONFIGURED: AuthFormState = {
  error:
    "Supabase isn't configured yet. Copy .env.example to .env.local first.",
};

const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Enter your password."),
});

/** Normalized signup output shared by the customer + provider branches. */
type SignUpData = {
  fullName: string;
  email: string;
  password: string;
  address_line1: string;
  address_line2: string;
  city: string;
  state: string;
  postal_code: string;
  dateOfBirth?: string;
  companyName?: string;
};

/**
 * GoTrue's email rate-limit error is user-hostile ("you can only request this
 * after 0 seconds") — translate it; pass everything else through.
 */
function friendlyAuthEmailError(error: AuthError): string {
  return error.code === "over_email_send_rate_limit"
    ? "We just sent you an email. Give it a minute to arrive, then try again."
    : error.message;
}

async function siteOrigin() {
  const headerList = await headers();
  return (
    headerList.get("origin") ??
    `https://${headerList.get("host") ?? "localhost:3000"}`
  );
}

export async function logIn(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  if (!hasSupabaseEnv()) return NOT_CONFIGURED;

  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error || !data.user) {
    return { error: "Wrong email or password." };
  }

  // Providers land on their work surface, everyone else on their bookings.
  const shape = await getAccountShape(supabase, data.user.id);
  const home =
    shape.role === "admin"
      ? homePathFor("admin")
      : homePathFor(shape.providerCapable ? "provider" : "customer");

  const next = formData.get("next");
  const destination =
    typeof next === "string" && next.startsWith("/") ? next : home;
  const accepted = await hasAcceptedCurrentMasterAgreement(supabase, {
    userId: data.user.id,
    variant: requiredMasterVariant(shape.role, shape.providerCapable),
  });

  redirect(
    accepted || destination.startsWith("/legal/master")
      ? destination
      : masterAgreementPath(destination),
  );
}

async function signUp(
  intent: "customer" | "provider",
  formData: FormData,
): Promise<AuthFormState> {
  if (!hasSupabaseEnv()) return NOT_CONFIGURED;

  const raw = {
    fullName: formData.get("fullName"),
    email: formData.get("email"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
    address_line1: formData.get("address_line1"),
    address_line2: formData.get("address_line2") ?? "",
    city: formData.get("city"),
    state: formData.get("state"),
    postal_code: formData.get("postal_code"),
    ...(intent === "provider"
      ? {
          dateOfBirth: formData.get("dateOfBirth"),
          companyName: formData.get("companyName") ?? "",
        }
      : {}),
  };

  // Parse per intent so the output type stays concrete (a union of the two
  // schemas collapses field types to unknown).
  let data: SignUpData;
  if (intent === "provider") {
    const parsed = providerSignUpSchema.safeParse(raw);
    if (!parsed.success) return { error: parsed.error.issues[0].message };
    data = parsed.data;
  } else {
    const parsed = customerSignUpSchema.safeParse(raw);
    if (!parsed.success) return { error: parsed.error.issues[0].message };
    data = parsed.data;
  }

  // Provider-intent signups use any email (personal is fine). Student status
  // is proven later in onboarding by verifying a school (.edu) email via OTP
  // and by manual student-ID review — not by the login address.

  const origin = await siteOrigin();
  // Every account is created equal; signup_intent only routes the
  // confirmation email back to onboarding. Authorization never reads it.
  const metadata: Record<string, string> = {
    full_name: data.fullName,
    signup_intent: intent,
    address_line1: data.address_line1,
    address_line2: data.address_line2,
    city: data.city,
    state: data.state,
    postal_code: data.postal_code,
  };
  if (data.dateOfBirth) {
    metadata.date_of_birth = data.dateOfBirth;
  }
  if (data.companyName) {
    metadata.company_name = data.companyName;
  }

  // GoTrue obfuscates duplicate signups as successes: a confirmed duplicate
  // comes back as a fake user with no email sent, and an UNCONFIRMED duplicate
  // quietly mints a fresh confirmation token — killing the link in every
  // earlier email. Detect both up front (an unconfirmed duplicate is
  // indistinguishable from a fresh signup in the response), or the user clicks
  // a dead link and concludes confirmation is broken.
  let existedUnconfirmed = false;
  if (hasServiceRoleEnv()) {
    const admin = createAdminClient();
    const { data: confirmed } = await admin.rpc("email_is_confirmed", {
      p_email: data.email,
    });
    if (confirmed) {
      return {
        success: `${data.email} already has an account. Log in with the password you chose when you first signed up.`,
        email: data.email,
        alreadyConfirmed: true,
      };
    }
    const { data: existingIntent } = await admin.rpc(
      "signup_intent_for_email",
      { p_email: data.email },
    );
    existedUnconfirmed = existingIntent !== null;
  }

  const supabase = await createClient();
  const { data: signUpResult, error } = await supabase.auth.signUp({
    email: data.email,
    password: data.password,
    options: {
      data: metadata,
      // Auth templates own the callback path + query string. Supplying only
      // the origin keeps RedirectTo valid even when GoTrue falls back to the
      // configured Site URL, and prevents `origin&token_hash=...` links.
      emailRedirectTo: origin,
    },
  });
  if (error) {
    return { error: friendlyAuthEmailError(error) };
  }

  if (existedUnconfirmed) {
    return {
      success:
        "You already started signing up, so we just emailed you a fresh confirmation link. Only this newest email works; links in earlier emails are now dead.",
      email: data.email,
    };
  }

  // Confirmed-duplicate tell when the service-role env isn't available.
  if (signUpResult.user && signUpResult.user.identities?.length === 0) {
    return {
      success: `${data.email} already has an account. Log in with the password you chose when you first signed up.`,
      email: data.email,
      alreadyConfirmed: true,
    };
  }

  // The handle_new_user trigger has persisted the address; derive coordinates
  // for the distance feature. Best-effort — a miss degrades to town-only.
  if (signUpResult.user) {
    await geocodeProfileAddress(signUpResult.user.id, {
      line1: data.address_line1,
      city: data.city,
      state: data.state,
      zip: data.postal_code,
    });
  }

  return {
    success:
      "Almost there! Check your email and click the confirmation link to activate your account.",
    email: data.email,
  };
}

export async function signUpCustomer(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  return signUp("customer", formData);
}

export async function signUpProvider(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  return signUp("provider", formData);
}

/**
 * Resend the signup confirmation email. Wired to the "check your email" panel
 * and the /verify-email recovery page so an expired link is never a dead end.
 *
 * Supabase's resend() is a no-op on an already-confirmed account — it returns
 * success and sends nothing. Reporting that as "sent!" is how a user ends up
 * waiting forever for an email that was never going to come, so we check the
 * confirmed state first and tell them the truth: the account is ready, go log in.
 */
export async function resendConfirmation(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  if (!hasSupabaseEnv()) return NOT_CONFIGURED;

  const parsed = emailSchema.safeParse(formData.get("email"));
  if (!parsed.success) {
    return { error: "Enter the email you signed up with." };
  }

  if (hasServiceRoleEnv()) {
    const admin = createAdminClient();
    const { data: confirmed } = await admin.rpc("email_is_confirmed", {
      p_email: parsed.data,
    });
    if (confirmed) {
      return {
        success: `${parsed.data} is already verified. There's no new email to send. Log in with the password you chose at signup.`,
        email: parsed.data,
        alreadyConfirmed: true,
      };
    }
  }

  const origin = await siteOrigin();
  const supabase = await createClient();
  const { error } = await supabase.auth.resend({
    type: "signup",
    email: parsed.data,
    options: {
      emailRedirectTo: origin,
    },
  });
  if (error) {
    return { error: friendlyAuthEmailError(error) };
  }

  return {
    success: `New confirmation email sent to ${parsed.data}. It can take a minute to arrive, and only this newest link works; earlier emails are now dead.`,
    email: parsed.data,
  };
}

/**
 * Kick off a password reset. Neutral message either way so we don't reveal
 * whether an email is registered.
 */
export async function requestPasswordReset(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const neutral: AuthFormState = {
    success:
      "If that email has an account, we just sent a link to reset your password.",
  };
  if (!hasSupabaseEnv()) return NOT_CONFIGURED;

  const parsed = emailSchema.safeParse(formData.get("email"));
  if (!parsed.success) {
    return { error: "Enter a valid email address." };
  }

  const origin = await siteOrigin();
  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(parsed.data, {
    redirectTo: origin,
  });

  return neutral;
}

/**
 * Set a new password. Runs after the recovery link established a session via
 * the auth callback route.
 */
export async function resetPassword(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  if (!hasSupabaseEnv()) return NOT_CONFIGURED;

  const parsed = resetPasswordSchema.safeParse({
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      error:
        "Your reset link has expired. Request a new one from “Forgot password”.",
    };
  }

  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
  });
  if (error) {
    return { error: error.message };
  }

  const shape = await getAccountShape(supabase, user.id);
  redirect(
    homePathFor(
      shape.role === "admin"
        ? "admin"
        : shape.providerCapable
          ? "provider"
          : "customer",
    ),
  );
}

/**
 * Lightweight "is there a session yet?" poll for the post-signup panel. Once
 * the confirmation link (opened in another tab of the same browser) sets the
 * shared session cookie, this returns true and the panel advances the user in.
 */
export async function checkSignedIn(): Promise<boolean> {
  if (!hasSupabaseEnv()) return false;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return Boolean(user);
}

export async function signOut() {
  if (hasSupabaseEnv()) {
    const supabase = await createClient();
    await supabase.auth.signOut();
  }
  redirect("/");
}
