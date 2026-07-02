"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { homePathFor } from "@/lib/auth/session";
import type { UserRole } from "@/lib/db/types";
import { hasSupabaseEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

/**
 * Shared auth actions (auth is shared ownership — coordinate changes).
 * Role is passed as signup metadata and clamped to customer|provider by the
 * handle_new_user trigger; admin is only ever assigned manually in the DB.
 */

export type AuthFormState = {
  error?: string;
  success?: string;
};

const NOT_CONFIGURED: AuthFormState = {
  error:
    "Supabase isn't configured yet — copy .env.example to .env.local first.",
};

const credentialsSchema = z.object({
  email: z.string().trim().email("Enter a valid email address."),
  password: z.string().min(8, "Password must be at least 8 characters."),
});

const signUpSchema = credentialsSchema.extend({
  fullName: z.string().trim().min(1, "Enter your name."),
  over18: z.literal("on", {
    message: "You must confirm you're 18 or older.",
  }),
});

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

  const parsed = credentialsSchema.safeParse({
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

  const parsed = signUpSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    fullName: formData.get("fullName"),
    over18: formData.get("over18"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  // Student gate for providers: .edu email + manual ID review later.
  if (role === "provider" && !parsed.data.email.toLowerCase().endsWith(".edu")) {
    return {
      error:
        "Providers sign up with their school (.edu) email — that's how we verify you're a student.",
    };
  }

  const origin = await siteOrigin();
  const confirmedNext =
    role === "provider" ? "/provider/onboarding/verify" : "/dashboard";

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { full_name: parsed.data.fullName, role },
      emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(confirmedNext)}`,
    },
  });
  if (error) {
    return { error: error.message };
  }

  return {
    success:
      "Almost there — check your email and click the confirmation link to activate your account.",
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

export async function signOut() {
  if (hasSupabaseEnv()) {
    const supabase = await createClient();
    await supabase.auth.signOut();
  }
  redirect("/");
}
