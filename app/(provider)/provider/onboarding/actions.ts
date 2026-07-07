"use server";

import { createHash, randomInt } from "node:crypto";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getOwnProviderProfile, requireRole } from "@/lib/auth/session";
import { hasServiceRoleEnv } from "@/lib/env";
import { sendSchoolOtpEmail } from "@/lib/email/send";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { otpCodeSchema, schoolEmailSchema } from "@/lib/validation/auth";

import { savePricingRows } from "../_lib/pricing";

/**
 * Onboarding wizard actions (SPEC §8: account → verify → services → review).
 * Stripe is deliberately NOT here — it connects after admin approval.
 */

export type OnboardingFormState = { error?: string };

/** Account step "Continue": creates the provider_profiles row if missing. */
export async function startProviderProfile() {
  const session = await requireRole("provider", "/provider/onboarding/account");

  const existing = await getOwnProviderProfile();
  if (!existing) {
    const supabase = await createClient();
    const { error } = await supabase.from("provider_profiles").insert({
      user_id: session.user.id,
      display_name: session.profile.full_name,
    });
    if (error && error.code !== "23505") {
      throw new Error(`Could not start onboarding: ${error.message}`);
    }
  }

  redirect("/provider/onboarding/verify");
}

const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

/** Verify step: uploads the student ID to the private id-documents bucket. */
export async function saveIdDocument(
  _prev: OnboardingFormState,
  formData: FormData,
): Promise<OnboardingFormState> {
  const session = await requireRole("provider");
  const profile = await getOwnProviderProfile();
  if (!profile) redirect("/provider/onboarding/account");

  const file = formData.get("document");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose a photo or scan of your student ID." };
  }
  if (file.size > MAX_DOCUMENT_BYTES) {
    return { error: "That file is over 10 MB — use a smaller photo." };
  }
  if (!file.type.startsWith("image/") && file.type !== "application/pdf") {
    return { error: "Upload an image or a PDF." };
  }

  const extension = file.name.split(".").pop() ?? "jpg";
  const path = `${session.user.id}/student-id-${Date.now()}.${extension}`;

  const supabase = await createClient();
  const { error: uploadError } = await supabase.storage
    .from("id-documents")
    .upload(path, file);
  if (uploadError) {
    return { error: `Upload failed: ${uploadError.message}` };
  }

  const { error: saveError } = await supabase
    .from("provider_profiles")
    .update({ id_document_url: path })
    .eq("id", profile.id);
  if (saveError) {
    return { error: "Could not save the document — try again." };
  }

  // Stay on the Verify step: progression to services is gated on BOTH the ID
  // and a verified school email, controlled by the page-level Next button.
  revalidatePath("/provider/onboarding/verify");
  redirect("/provider/onboarding/verify");
}

/** Services step: initial offerings + pricing (editable later in settings). */
export async function saveOnboardingPricing(
  _prev: OnboardingFormState,
  formData: FormData,
): Promise<OnboardingFormState> {
  await requireRole("provider");
  const profile = await getOwnProviderProfile();
  if (!profile) redirect("/provider/onboarding/account");

  const result = await savePricingRows(profile.id, formData);
  if (result.error) return result;

  redirect("/provider/onboarding/review");
}

// ---------------------------------------------------------------------------
// School-email (.edu) OTP verification (Verify step).
//
// The login email is now personal; student status is proven by owning a .edu.
// The secret code lives only in provider_email_verifications (service-role
// only); a successful match records the verified address in
// provider_school_emails. Both writes use the service-role client because
// neither table is client-writable — the browser must never mint a "verified"
// row or read a live code.
// ---------------------------------------------------------------------------

export type SchoolEmailFormState = { error?: string; notice?: string };

const OTP_TTL_MS = 15 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_ATTEMPTS = 5;

const NOT_CONFIGURED: SchoolEmailFormState = {
  error: "Email verification isn't configured yet — add SUPABASE_SERVICE_ROLE_KEY.",
};

/** Codes are stored hashed and salted with the user id — never in the clear. */
function hashCode(userId: string, code: string) {
  return createHash("sha256").update(`${userId}:${code}`).digest("hex");
}

/** Send (or resend) a 6-digit code to the provider's school email. */
export async function sendSchoolEmailOtp(
  _prev: SchoolEmailFormState,
  formData: FormData,
): Promise<SchoolEmailFormState> {
  const session = await requireRole("provider");
  if (!hasServiceRoleEnv()) return NOT_CONFIGURED;

  const parsed = schoolEmailSchema.safeParse(formData.get("email"));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const email = parsed.data;

  const admin = createAdminClient();

  // Anti-sharing: a verified .edu belongs to exactly one provider.
  const { data: taken } = await admin
    .from("provider_school_emails")
    .select("user_id")
    .eq("email", email)
    .maybeSingle();
  if (taken && taken.user_id !== session.user.id) {
    return { error: "That school email is already linked to another account." };
  }

  // Throttle resends so the inbox (and our sender) isn't hammered.
  const { data: existing } = await admin
    .from("provider_email_verifications")
    .select("created_at")
    .eq("user_id", session.user.id)
    .maybeSingle();
  if (
    existing &&
    Date.now() - new Date(existing.created_at).getTime() < RESEND_COOLDOWN_MS
  ) {
    return { error: "Give it a moment before requesting another code." };
  }

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");

  // Send FIRST: a failed delivery must not persist a code or burn the resend
  // cooldown (the cooldown reads created_at on this row). Only on a confirmed
  // send do we record the pending verification.
  const sent = await sendSchoolOtpEmail(email, code);
  if (!sent.ok) return { error: `Could not send the code: ${sent.error}` };

  const { error: upsertError } = await admin
    .from("provider_email_verifications")
    .upsert({
      user_id: session.user.id,
      email,
      code_hash: hashCode(session.user.id, code),
      attempts: 0,
      expires_at: new Date(Date.now() + OTP_TTL_MS).toISOString(),
      created_at: new Date().toISOString(),
    });
  if (upsertError) return { error: "Could not start verification — try again." };

  revalidatePath("/provider/onboarding/verify");
  return { notice: `We sent a 6-digit code to ${email}. It expires in 15 minutes.` };
}

/** Check the entered code; on match, record the verified school email. */
export async function verifySchoolEmailOtp(
  _prev: SchoolEmailFormState,
  formData: FormData,
): Promise<SchoolEmailFormState> {
  const session = await requireRole("provider");
  if (!hasServiceRoleEnv()) return NOT_CONFIGURED;

  const parsed = otpCodeSchema.safeParse(formData.get("code"));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const code = parsed.data;

  const admin = createAdminClient();
  const { data: row } = await admin
    .from("provider_email_verifications")
    .select("email, code_hash, attempts, expires_at")
    .eq("user_id", session.user.id)
    .maybeSingle();

  if (!row) return { error: "No code to verify — request one first." };

  const clear = () =>
    admin
      .from("provider_email_verifications")
      .delete()
      .eq("user_id", session.user.id);

  if (new Date(row.expires_at).getTime() < Date.now()) {
    await clear();
    return { error: "That code expired — request a new one." };
  }
  if (row.attempts >= MAX_ATTEMPTS) {
    await clear();
    return { error: "Too many attempts — request a new code." };
  }
  if (hashCode(session.user.id, code) !== row.code_hash) {
    await admin
      .from("provider_email_verifications")
      .update({ attempts: row.attempts + 1 })
      .eq("user_id", session.user.id);
    return { error: "That code isn't right. Check your email and try again." };
  }

  const { error: saveError } = await admin
    .from("provider_school_emails")
    .upsert({
      user_id: session.user.id,
      email: row.email,
      verified_at: new Date().toISOString(),
    });
  if (saveError) {
    // 23505 => someone else verified this .edu between send and now.
    if (saveError.code === "23505") {
      return { error: "That school email is already linked to another account." };
    }
    return { error: "Could not save verification — try again." };
  }
  await clear();

  revalidatePath("/provider/onboarding/verify");
  revalidatePath("/provider/onboarding/review");
  return { notice: "School email verified ✓" };
}

/**
 * Shortcut for providers who signed up WITH their .edu as their login email:
 * Supabase already confirmed it, so no second OTP is needed.
 */
export async function useAccountEmailAsSchool(
  _prev: SchoolEmailFormState,
  _formData: FormData,
): Promise<SchoolEmailFormState> {
  void _formData; // no form input; signature required by useActionState

  const session = await requireRole("provider");
  if (!hasServiceRoleEnv()) return NOT_CONFIGURED;

  const email = session.user.email?.toLowerCase();
  if (!email || !email.endsWith(".edu") || !session.user.email_confirmed_at) {
    return { error: "Your account email isn't a confirmed .edu address." };
  }

  const admin = createAdminClient();
  const { data: taken } = await admin
    .from("provider_school_emails")
    .select("user_id")
    .eq("email", email)
    .maybeSingle();
  if (taken && taken.user_id !== session.user.id) {
    return { error: "That school email is already linked to another account." };
  }

  const { error } = await admin
    .from("provider_school_emails")
    .upsert({
      user_id: session.user.id,
      email,
      verified_at: new Date().toISOString(),
    });
  if (error) return { error: "Could not save verification — try again." };

  await admin
    .from("provider_email_verifications")
    .delete()
    .eq("user_id", session.user.id);

  revalidatePath("/provider/onboarding/verify");
  revalidatePath("/provider/onboarding/review");
  return { notice: "School email verified ✓" };
}

/** Review step: onboarding complete; verification is already pending. */
export async function submitForReview() {
  await requireRole("provider");
  const profile = await getOwnProviderProfile();
  if (!profile) redirect("/provider/onboarding/account");

  redirect("/provider/dashboard?submitted=1");
}
