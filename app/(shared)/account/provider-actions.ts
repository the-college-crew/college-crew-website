"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getOwnProviderProfile, requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

import { savePricingRows } from "@/app/(provider)/provider/_lib/pricing";

/**
 * Provider storefront actions for the unified /account page. These mutate the
 * caller's own provider_profiles row (RLS-scoped) and revalidate /account,
 * where the provider now manages their storefront. Password/profile/delete live
 * in ./actions — shared across all roles.
 */

export type ProviderSettingsFormState = {
  error?: string;
  success?: string;
  fieldErrors?: Record<string, string>;
};

const profileSchema = z.object({
  displayName: z.string().trim().min(1, "Enter a display name."),
  providerType: z.enum(["business", "individual"]),
  neighborhood: z.string().trim().max(120).optional().default(""),
  bio: z.string().trim().max(2000).optional().default(""),
});

/** Storefront fields — these render directly on the public profile. */
export async function updateProviderProfile(
  _prev: ProviderSettingsFormState,
  formData: FormData,
): Promise<ProviderSettingsFormState> {
  await requireRole("provider");
  const profile = await getOwnProviderProfile();
  if (!profile) redirect("/provider/onboarding/account");

  const parsed = profileSchema.safeParse({
    displayName: formData.get("displayName"),
    providerType: formData.get("providerType"),
    neighborhood: formData.get("neighborhood"),
    bio: formData.get("bio"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("provider_profiles")
    .update({
      display_name: parsed.data.displayName,
      provider_type: parsed.data.providerType,
      neighborhood: parsed.data.neighborhood,
      bio: parsed.data.bio,
    })
    .eq("id", profile.id);
  if (error) {
    return { error: "Could not save your profile — try again." };
  }

  revalidatePath("/account");
  return { success: "Profile saved." };
}

const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

/** Simple pilot availability: weekday toggles + a free-text note (jsonb). */
export async function updateAvailability(
  _prev: ProviderSettingsFormState,
  formData: FormData,
): Promise<ProviderSettingsFormState> {
  await requireRole("provider");
  const profile = await getOwnProviderProfile();
  if (!profile) redirect("/provider/onboarding/account");

  const days = DAYS.filter((day) => formData.get(`day_${day}`) === "on");
  const note = String(formData.get("note") ?? "")
    .trim()
    .slice(0, 500);

  const supabase = await createClient();
  const { error } = await supabase
    .from("provider_profiles")
    .update({ availability: { days, note } })
    .eq("id", profile.id);
  if (error) {
    return { error: "Could not save availability — try again." };
  }

  revalidatePath("/account");
  return { success: "Availability saved." };
}

/** Pricing source of truth (SPEC §3) — Jobs & pricing shows it read-only. */
export async function saveSettingsPricing(
  _prev: ProviderSettingsFormState,
  formData: FormData,
): Promise<ProviderSettingsFormState> {
  await requireRole("provider");
  const profile = await getOwnProviderProfile();
  if (!profile) redirect("/provider/onboarding/account");

  const result = await savePricingRows(profile.id, formData);
  if (result.error || result.fieldErrors) {
    return { error: result.error, fieldErrors: result.fieldErrors };
  }

  revalidatePath("/account");
  revalidatePath("/provider/jobs");
  return { success: "Pricing saved — your public profile is updated." };
}
