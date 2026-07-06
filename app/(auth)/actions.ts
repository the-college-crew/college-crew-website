"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { homePathFor } from "@/lib/auth/session";
import type { UserRole } from "@/lib/db/types";
import { hasSupabaseEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import {
  customerSignUpSchema,
  emailSchema,
  providerSignUpSchema,
  resetPasswordSchema,
} from "@/lib/validation/auth";

/**
 * Shared auth actions (auth is shared ownership — coordinate changes).
 * Role is passed as signup metadata and clamped to customer|provider by the
 * handle_new_user trigger; admin is only ever assigned manually in the DB.
 * DOB + address also ride in as metadata and are persisted by that trigger.
 */

export type AuthFormState = {
  error?: string;
  success?: string;
  /** Set on a successful signup so the "check your email" panel can resend. */
  email?: string;
};

const NOT_CONFIGURED: AuthFormState = {
  error:
    "Supabase isn't configured yet — copy .env.example to .env.local first.",
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
};

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

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", data.user.id)
    .single();

  const next = formData.get("next");
  redirect(
    typeof next === "string" && next.startsWith("/")
      ? next
      : homePathFor((profile?.role ?? "customer") as UserRole),
  );
}

async function signUp(
  role: Extract<UserRole, "customer" | "provider">,
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
    ...(role === "provider" ? { dateOfBirth: formData.get("dateOfBirth") } : {}),
  };

  // Parse per role so the output type stays concrete (a union of the two
  // schemas collapses field types to unknown).
  let data: SignUpData;
  if (role === "provider") {
    const parsed = providerSignUpSchema.safeParse(raw);
    if (!parsed.success) return { error: parsed.error.issues[0].message };
    data = parsed.data;
  } else {
    const parsed = customerSignUpSchema.safeParse(raw);
    if (!parsed.success) return { error: parsed.error.issues[0].message };
    data = parsed.data;
  }

  // Providers sign up with any email (personal is fine). Student status is
  // proven later in onboarding by verifying a school (.edu) email via OTP and
  // by manual student-ID review — not by the login address.

  const origin = await siteOrigin();
  const confirmedNext =
    role === "provider" ? "/provider/onboarding/verify" : "/dashboard";

  const metadata: Record<string, string> = {
    full_name: data.fullName,
    role,
    address_line1: data.address_line1,
    address_line2: data.address_line2,
    city: data.city,
    state: data.state,
    postal_code: data.postal_code,
  };
  if (data.dateOfBirth) {
    metadata.date_of_birth = data.dateOfBirth;
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email: data.email,
    password: data.password,
    options: {
      data: metadata,
      emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(confirmedNext)}`,
    },
  });
  if (error) {
    return { error: error.message };
  }

  return {
    success:
      "Almost there — check your email and click the confirmation link to activate your account.",
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

  const origin = await siteOrigin();
  const supabase = await createClient();
  const { error } = await supabase.auth.resend({
    type: "signup",
    email: parsed.data,
    options: { emailRedirectTo: `${origin}/auth/callback?next=/dashboard` },
  });
  if (error) {
    return { error: error.message };
  }

  return {
    success: `New confirmation email sent to ${parsed.data}. It can take a minute to arrive.`,
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
    redirectTo: `${origin}/auth/callback?next=/reset-password`,
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

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  redirect(homePathFor((profile?.role ?? "customer") as UserRole));
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
