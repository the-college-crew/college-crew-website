"use server";

import { redirect } from "next/navigation";

import { getOwnProviderProfile, requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

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

  redirect("/provider/onboarding/services");
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

/** Review step: onboarding complete; verification is already pending. */
export async function submitForReview() {
  await requireRole("provider");
  const profile = await getOwnProviderProfile();
  if (!profile) redirect("/provider/onboarding/account");

  redirect("/provider/dashboard?submitted=1");
}
