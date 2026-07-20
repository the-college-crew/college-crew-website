"use server";

import { createHash, randomInt } from "node:crypto";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import type { AvailabilityFormState } from "@/app/(provider)/provider/_components/provider-availability-form";
import {
  getOwnProviderProfile,
  requireOnboardingUser,
} from "@/lib/auth/session";
import { getProviderAvailabilityWindows } from "@/lib/db/queries";
import {
  claimAccountEmailAsSchool,
  eligibleAccountSchoolEmail,
  getVerifiedSchoolEmail,
} from "@/lib/db/school-email";
import { hasServiceRoleEnv } from "@/lib/env";
import { sendSchoolOtpEmail } from "@/lib/email/send";
import type { Json } from "@/lib/db/types";
import {
  hasAcceptedCurrentLegalDocument,
  legalDocumentPath,
  requestAuditFields,
  stableContentHash,
} from "@/lib/legal/acceptance";
import {
  getProviderTermsSnapshot,
  PROVIDER_TERMS_VERSION,
} from "@/lib/legal/waivers";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  otpCodeSchema,
  providerStartSchema,
  schoolEmailSchema,
} from "@/lib/validation/auth";
import {
  isStructuredAvailabilityComplete,
  parseProviderAvailabilityForm,
} from "@/lib/provider/setup";
import { isHourlyRateValid } from "@/lib/booking/policy";

import { savePricingRows } from "../_lib/pricing";

/**
 * Onboarding wizard actions (account → verify → services → availability →
 * review).
 * Stripe is deliberately NOT here — it connects after admin approval.
 */

export type OnboardingFormState = {
  error?: string;
  fieldErrors?: Record<string, string>;
};

/**
 * Account step "Continue": turns any regular account into a provider-capable
 * one. Creates the provider_profiles row if missing — after making sure we
 * hold a date of birth (customers never provided one at signup; the 18+ gate
 * is real). Provider-specific terms are accepted at final review, when the
 * services, pricing, and availability they govern are concrete.
 */
export async function startProviderProfile(
  _prev: OnboardingFormState,
  formData: FormData,
): Promise<OnboardingFormState> {
  const session = await requireOnboardingUser("/provider/onboarding/account");

  const parsed = providerStartSchema.safeParse({
    dateOfBirth: formData.get("dateOfBirth") || undefined,
    companyName: formData.get("companyName") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  // The 18+ gate holds regardless of how far the account got before: even a
  // provider_profiles row created outside this action (direct insert, legacy
  // data) doesn't excuse a missing DOB. Provider-intent signups stored one at
  // signup; upgrading customers submit it now. date_of_birth is an
  // age-verified field with no client update grant, so the write goes through
  // the service-role client. The database enforces the same invariant: the
  // provider_profiles insert policy requires an adult DOB on the profile.
  if (!session.profile.date_of_birth) {
    if (!parsed.data.dateOfBirth) {
      return { error: "Enter your date of birth." };
    }
    if (!hasServiceRoleEnv()) {
      return {
        error:
          "Onboarding isn't configured yet — add SUPABASE_SERVICE_ROLE_KEY.",
      };
    }
    const admin = createAdminClient();
    const { error: dobError } = await admin
      .from("profiles")
      .update({ date_of_birth: parsed.data.dateOfBirth })
      .eq("id", session.user.id);
    if (dobError) {
      return { error: "Could not save your date of birth — try again." };
    }
  }

  const existing = await getOwnProviderProfile();
  if (!existing) {
    const metadataCompany = session.user.user_metadata.company_name;
    const companyName =
      parsed.data.companyName ??
      (typeof metadataCompany === "string" ? metadataCompany : null);

    const supabase = await createClient();
    const { error } = await supabase.from("provider_profiles").insert({
      user_id: session.user.id,
      display_name: session.profile.full_name,
      company_name: companyName || null,
    });
    if (error && error.code !== "23505") {
      return { error: `Could not start onboarding: ${error.message}` };
    }
  }

  // Signed up with a .edu? Supabase already confirmed they own it, so that IS
  // the student proof — carry it straight over instead of mailing a code to the
  // address they just clicked a link in. A failure here is not fatal: the
  // Verify step still offers the OTP (e.g. when the .edu belongs to another
  // account, in which case they must use a different one).
  const accountEmail = eligibleAccountSchoolEmail(session.user);
  if (accountEmail) {
    await claimAccountEmailAsSchool(session.user.id, accountEmail);
  }

  redirect("/provider/onboarding/verify");
}

const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

/** Label a driver's-license side for error copy. */
const SIDE_LABEL = { front: "front", back: "back (barcode side)" } as const;

/** Validate one uploaded license image; null when it passes. */
function validateLicenseFile(file: File, side: "front" | "back"): string | null {
  if (file.size > MAX_DOCUMENT_BYTES) {
    return `The ${SIDE_LABEL[side]} image is over 10 MB — use a smaller photo.`;
  }
  if (!file.type.startsWith("image/") && file.type !== "application/pdf") {
    return `Upload a photo or PDF for the ${SIDE_LABEL[side]} of your license.`;
  }
  return null;
}

/**
 * Verify step: uploads the two driver's-license images (front + back barcode)
 * to the private id-documents bucket. Each side is optional per submit so a
 * provider can re-upload just one — but the step only counts as complete once
 * BOTH columns are set (enforced by the page-level Next gate).
 */
export async function saveIdDocument(
  _prev: OnboardingFormState,
  formData: FormData,
): Promise<OnboardingFormState> {
  const session = await requireOnboardingUser();
  const profile = await getOwnProviderProfile();
  if (!profile) redirect("/provider/onboarding/account");

  const front = formData.get("front");
  const back = formData.get("back");
  const hasFront = front instanceof File && front.size > 0;
  const hasBack = back instanceof File && back.size > 0;

  // Require a file only for a side that isn't already on record.
  if (!hasFront && !profile.id_document_url) {
    return { error: "Upload a photo of the front of your driver's license." };
  }
  if (!hasBack && !profile.id_document_back_url) {
    return {
      error: "Upload a photo of the back (barcode side) of your license.",
    };
  }
  if (!hasFront && !hasBack) {
    return { error: "Choose a photo to upload." };
  }

  const supabase = await createClient();
  const update: { id_document_url?: string; id_document_back_url?: string } = {};

  for (const [side, file, provided] of [
    ["front", front, hasFront],
    ["back", back, hasBack],
  ] as const) {
    if (!provided) continue;
    const image = file as File;
    const error = validateLicenseFile(image, side);
    if (error) return { error };

    const extension = image.name.split(".").pop() ?? "jpg";
    const path = `${session.user.id}/license-${side}-${Date.now()}.${extension}`;
    const { error: uploadError } = await supabase.storage
      .from("id-documents")
      .upload(path, image);
    if (uploadError) {
      return { error: `Upload failed: ${uploadError.message}` };
    }
    if (side === "front") update.id_document_url = path;
    else update.id_document_back_url = path;
  }

  const { error: saveError } = await supabase
    .from("provider_profiles")
    .update(update)
    .eq("id", profile.id);
  if (saveError) {
    return { error: "Could not save the images — try again." };
  }

  // Stay on the Verify step: progression to services is gated on BOTH license
  // images and a verified school email, controlled by the page-level Next button.
  revalidatePath("/provider/onboarding/verify");
  redirect("/provider/onboarding/verify");
}

/** Services step: initial offerings + pricing (editable later in settings). */
export async function saveOnboardingPricing(
  _prev: OnboardingFormState,
  formData: FormData,
): Promise<OnboardingFormState> {
  await requireOnboardingUser();
  const profile = await getOwnProviderProfile();
  if (!profile) redirect("/provider/onboarding/account");

  const result = await savePricingRows(profile.id, formData);
  if (result.error || result.fieldErrors) return result;

  redirect("/provider/onboarding/availability");
}

/** Availability step: per-day schedule windows, notice, and private service ZIP. */
export async function saveOnboardingAvailability(
  _prev: AvailabilityFormState,
  formData: FormData,
): Promise<AvailabilityFormState> {
  await requireOnboardingUser();
  const profile = await getOwnProviderProfile();
  if (!profile) redirect("/provider/onboarding/account");

  const parsed = parseProviderAvailabilityForm(formData);
  if (!parsed.success) return { fieldErrors: parsed.fieldErrors };

  // Atomic replace-all of the windows plus the profile fields — the sole
  // write path for provider_availability_windows.
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_provider_availability", {
    p_windows: parsed.data.windows.map((window) => ({
      weekday: window.weekday,
      start: window.start_local,
      end: window.end_local,
    })),
    p_availability_note: parsed.data.availability_note,
    // The parser guarantees a five-digit ZIP; the fallback only satisfies TS.
    p_service_zip: parsed.data.service_zip ?? "",
    p_minimum_notice_hours: parsed.data.minimum_notice_hours,
  });
  if (error) return { error: "Could not save availability — try again." };

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
  const session = await requireOnboardingUser();
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
  const session = await requireOnboardingUser();
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
 * Manual fallback for providers who signed up WITH their .edu as their login
 * email. startProviderProfile already claims it automatically; this covers
 * accounts created before that existed, and stays reachable even mid-OTP so a
 * code that never arrives can't strand anyone.
 */
export async function useAccountEmailAsSchool(
  _prev: SchoolEmailFormState,
  _formData: FormData,
): Promise<SchoolEmailFormState> {
  void _formData; // no form input; signature required by useActionState

  const session = await requireOnboardingUser();
  if (!hasServiceRoleEnv()) return NOT_CONFIGURED;

  const email = eligibleAccountSchoolEmail(session.user);
  if (!email) {
    return { error: "Your account email isn't a confirmed .edu address." };
  }

  const claimed = await claimAccountEmailAsSchool(session.user.id, email);
  if (!claimed.ok) {
    return {
      error:
        claimed.reason === "taken"
          ? "That school email is already linked to another account."
          : "Could not save verification — try again.",
    };
  }

  revalidatePath("/provider/onboarding/verify");
  revalidatePath("/provider/onboarding/review");
  return { notice: "School email verified ✓" };
}

/** Review step: accept provider-only terms and submit complete onboarding. */
export async function submitForReview(
  _previous: OnboardingFormState,
  formData: FormData,
): Promise<OnboardingFormState> {
  const session = await requireOnboardingUser();
  const profile = await getOwnProviderProfile();
  if (!profile) redirect("/provider/onboarding/account");

  const [schoolEmail, supabase] = await Promise.all([
    getVerifiedSchoolEmail(session.user.id),
    createClient(),
  ]);
  if (!profile.avatar_image_path) {
    redirect("/provider/onboarding/verify?err=photo");
  }
  if (
    !schoolEmail ||
    !profile.id_document_url ||
    !profile.id_document_back_url
  ) {
    redirect("/provider/onboarding/verify");
  }

  const [{ data: offerings }, windows] = await Promise.all([
    supabase
      .from("provider_services")
      .select("hourly_rate_cents, service:services(is_live)")
      .eq("provider_id", profile.id),
    getProviderAvailabilityWindows(profile.id),
  ]);
  const hasReadyRate = (offerings ?? []).some(
    (offering) =>
      offering.service?.is_live &&
      offering.hourly_rate_cents !== null &&
      isHourlyRateValid(offering.hourly_rate_cents),
  );
  if (!hasReadyRate) redirect("/provider/onboarding/services");

  if (!isStructuredAvailabilityComplete(windows) || !profile.service_zip) {
    redirect("/provider/onboarding/availability");
  }

  if (
    !(await hasAcceptedCurrentLegalDocument(supabase, {
      userId: session.user.id,
      kind: "platform_terms",
    }))
  ) {
    redirect(
      legalDocumentPath("platform_terms", "/provider/onboarding/review"),
    );
  }

  const alreadyAccepted = await hasAcceptedCurrentLegalDocument(supabase, {
    userId: session.user.id,
    kind: "provider_terms",
  });
  if (!alreadyAccepted) {
    if (formData.get("acceptProviderTerms") !== "on") {
      return { error: "Review and accept the Provider Addendum." };
    }
    const snapshot = getProviderTermsSnapshot();
    const contentHash = stableContentHash(snapshot);
    if (formData.get("renderedProviderTermsHash") !== contentHash) {
      return {
        error:
          "The Provider Addendum changed while this page was open. Reload and review it again.",
      };
    }
    const audit = await requestAuditFields();
    const { error } = await supabase.from("legal_acceptances").insert({
      user_id: session.user.id,
      kind: "provider_terms",
      role: "provider",
      version: PROVIDER_TERMS_VERSION,
      content_hash: contentHash,
      signer_name: session.profile.full_name.trim(),
      snapshot: snapshot as Json,
      ...audit,
    });
    if (error && error.code !== "23505") {
      return { error: "Could not save the Provider Addendum. Try again." };
    }
  }

  redirect("/provider/dashboard?submitted=1");
}
