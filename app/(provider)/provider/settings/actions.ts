"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getOwnProviderProfile, requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { passwordSchema } from "@/lib/validation/auth";

import { savePricingRows } from "../_lib/pricing";

export type SettingsFormState = {
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
  _prev: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
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

  revalidatePath("/provider/settings");
  return { success: "Profile saved." };
}

const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

/** Simple pilot availability: weekday toggles + a free-text note (jsonb). */
export async function updateAvailability(
  _prev: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
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

  revalidatePath("/provider/settings");
  return { success: "Availability saved." };
}

/** Pricing source of truth (SPEC §3) — Jobs & pricing shows it read-only. */
export async function saveSettingsPricing(
  _prev: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  await requireRole("provider");
  const profile = await getOwnProviderProfile();
  if (!profile) redirect("/provider/onboarding/account");

  const result = await savePricingRows(profile.id, formData);
  if (result.error || result.fieldErrors) {
    return { error: result.error, fieldErrors: result.fieldErrors };
  }

  revalidatePath("/provider/settings");
  revalidatePath("/provider/jobs");
  return { success: "Pricing saved — your public profile is updated." };
}

export async function updatePassword(
  _prev: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  await requireRole("provider");

  const parsed = passwordSchema.safeParse(formData.get("password"));
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data });
  if (error) {
    return { error: error.message };
  }

  return { success: "Password updated." };
}
