"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { z } from "zod";

import { getOwnProviderProfile, requireRole } from "@/lib/auth/session";
import { PROVIDER_SERVICE_IMAGES_BUCKET } from "@/lib/media/provider-service-images";
import { screenProfileText } from "@/lib/moderation/profile-text";
import { createAdminClient } from "@/lib/supabase/admin";
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

const MAX_SERVICE_PREVIEW_BYTES = 5 * 1024 * 1024;
const SERVICE_PREVIEW_EXTENSION: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

function revalidateProviderStorefront(providerId: string) {
  revalidatePath("/");
  revalidatePath("/browse");
  revalidatePath(`/providers/${providerId}`);
  revalidatePath("/account");
}

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

  // display_name and bio are no longer client-writable (see migration
  // 20260713165821_profile_text_moderation.sql) — the column grant was revoked so
  // that no bio can be written from the browser without passing the scan below.
  // That makes this action the only write path, so it needs the service-role
  // client. .eq("id", profile.id) keeps it scoped to the caller's own row:
  // profile came from getOwnProviderProfile(), which is RLS-scoped to them.
  const admin = createAdminClient();
  const { error } = await admin
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

  // Moderation is FLAG-ONLY (SPEC §7): the text is saved and live either way.
  // Nothing here depends on the result, so it runs after the response — the
  // provider never waits on gpt-5.4-nano to see "Profile saved."
  //
  // Only CHANGED fields are scanned. Re-scanning unchanged text would file a
  // fresh flag every time the provider saved an unrelated field, burying the
  // real ones on the admin dashboard.
  const changed = [
    { field: "display_name", text: parsed.data.displayName, before: profile.display_name },
    { field: "bio", text: parsed.data.bio, before: profile.bio },
  ] as const;

  after(async () => {
    for (const { field, text, before } of changed) {
      if (text === before) continue;
      await screenProfileText({
        providerId: profile.id,
        userId: profile.user_id,
        field,
        text,
      });
    }
  });

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

/**
 * Save one public photo for an offered service. The server action both proves
 * the offering belongs to the signed-in provider and uses a new object path on
 * every replacement, avoiding stale CDN copies of the old photo.
 */
export async function uploadProviderServicePreview(
  _prev: ProviderSettingsFormState,
  formData: FormData,
): Promise<ProviderSettingsFormState> {
  await requireRole("provider");
  const profile = await getOwnProviderProfile();
  if (!profile) redirect("/provider/onboarding/account");

  const parsedId = z.string().uuid().safeParse(formData.get("providerServiceId"));
  if (!parsedId.success) return { error: "Unknown service." };

  const image = formData.get("image");
  if (!(image instanceof File) || image.size === 0) {
    return { error: "Choose a photo to upload." };
  }
  if (image.size > MAX_SERVICE_PREVIEW_BYTES) {
    return { error: "Choose an image smaller than 5 MB." };
  }
  const extension = SERVICE_PREVIEW_EXTENSION[image.type];
  if (!extension) {
    return { error: "Use a JPG, PNG, or WebP image." };
  }

  const supabase = await createClient();
  const { data: offering, error: offeringError } = await supabase
    .from("provider_services")
    .select("id, preview_image_path")
    .eq("id", parsedId.data)
    .eq("provider_id", profile.id)
    .maybeSingle();

  if (offeringError || !offering) {
    return { error: "That service is no longer available to edit." };
  }

  const path = `${profile.user_id}/${offering.id}/${randomUUID()}.${extension}`;
  const { error: uploadError } = await supabase.storage
    .from(PROVIDER_SERVICE_IMAGES_BUCKET)
    .upload(path, image, {
      cacheControl: "31536000",
      contentType: image.type,
      upsert: false,
    });

  if (uploadError) {
    return { error: `Photo upload failed: ${uploadError.message}` };
  }

  const { error: updateError } = await supabase
    .from("provider_services")
    .update({ preview_image_path: path })
    .eq("id", offering.id)
    .eq("provider_id", profile.id);

  if (updateError) {
    await supabase.storage.from(PROVIDER_SERVICE_IMAGES_BUCKET).remove([path]);
    return { error: "Could not save that photo — please try again." };
  }

  if (offering.preview_image_path) {
    await supabase.storage
      .from(PROVIDER_SERVICE_IMAGES_BUCKET)
      .remove([offering.preview_image_path]);
  }

  revalidateProviderStorefront(profile.id);
  return { success: "Service preview photo saved." };
}

/** Remove an existing public storefront photo without touching its offering. */
export async function removeProviderServicePreview(
  _prev: ProviderSettingsFormState,
  formData: FormData,
): Promise<ProviderSettingsFormState> {
  await requireRole("provider");
  const profile = await getOwnProviderProfile();
  if (!profile) redirect("/provider/onboarding/account");

  const parsedId = z.string().uuid().safeParse(formData.get("providerServiceId"));
  if (!parsedId.success) return { error: "Unknown service." };

  const supabase = await createClient();
  const { data: offering, error: offeringError } = await supabase
    .from("provider_services")
    .select("id, preview_image_path")
    .eq("id", parsedId.data)
    .eq("provider_id", profile.id)
    .maybeSingle();
  if (offeringError || !offering?.preview_image_path) {
    return { error: "There is no preview photo to remove." };
  }

  const path = offering.preview_image_path;
  const { error: updateError } = await supabase
    .from("provider_services")
    .update({ preview_image_path: null })
    .eq("id", offering.id)
    .eq("provider_id", profile.id);
  if (updateError) return { error: "Could not remove that photo — try again." };

  await supabase.storage.from(PROVIDER_SERVICE_IMAGES_BUCKET).remove([path]);
  revalidateProviderStorefront(profile.id);
  return { success: "Service preview photo removed." };
}
