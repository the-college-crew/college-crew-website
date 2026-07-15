"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { z } from "zod";

import { getOwnProviderProfile, requireRole } from "@/lib/auth/session";
import { PROVIDER_AVATARS_BUCKET } from "@/lib/media/provider-avatars";
import {
  BANNER_STYLES,
  PROVIDER_BANNERS_BUCKET,
  type BannerStyle,
} from "@/lib/media/provider-banners";
import { screenProfileText } from "@/lib/moderation/profile-text";
import { parseProviderAvailabilityForm } from "@/lib/provider/setup";
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

// Shared image-upload limits for the avatar and banner photos.
const MAX_IMAGE_UPLOAD_BYTES = 5 * 1024 * 1024;
const IMAGE_UPLOAD_EXTENSION: Record<string, string> = {
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
  companyName: z.string().trim().max(120).optional().default(""),
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
    companyName: formData.get("companyName"),
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
  const companyName = parsed.data.companyName || null;

  const admin = createAdminClient();
  const { error } = await admin
    .from("provider_profiles")
    .update({
      display_name: parsed.data.displayName,
      company_name: companyName,
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
    { field: "company_name", text: companyName ?? "", before: profile.company_name ?? "" },
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

/** Structured provider-wide pilot availability and private service area. */
export async function updateAvailability(
  _prev: ProviderSettingsFormState,
  formData: FormData,
): Promise<ProviderSettingsFormState> {
  await requireRole("provider");
  const profile = await getOwnProviderProfile();
  if (!profile) redirect("/provider/onboarding/account");

  const parsed = parseProviderAvailabilityForm(formData);
  if (!parsed.success) return { fieldErrors: parsed.fieldErrors };

  const supabase = await createClient();
  const { error } = await supabase
    .from("provider_profiles")
    .update(parsed.data)
    .eq("id", profile.id);
  if (error) {
    return { error: "Could not save availability — try again." };
  }

  revalidateProviderStorefront(profile.id);
  revalidatePath("/provider/dashboard");
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

  revalidateProviderStorefront(profile.id);
  revalidatePath("/provider/jobs");
  revalidatePath("/provider/dashboard");
  return { success: "Hourly rates saved — your public profile is updated." };
}

/**
 * Pick which built-in banner theme shows when no banner photo is uploaded. The
 * choice is remembered under any uploaded photo, so removing the photo reverts
 * to it. Validated against BANNER_STYLES (mirrors the column's CHECK).
 */
export async function updateProviderBannerStyle(
  _prev: ProviderSettingsFormState,
  formData: FormData,
): Promise<ProviderSettingsFormState> {
  await requireRole("provider");
  const profile = await getOwnProviderProfile();
  if (!profile) redirect("/provider/onboarding/account");

  const styleValue = formData.get("style");
  if (
    typeof styleValue !== "string" ||
    !BANNER_STYLES.includes(styleValue as BannerStyle)
  ) {
    return { error: "Pick a valid banner theme." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("provider_profiles")
    .update({ banner_style: styleValue })
    .eq("id", profile.id);
  if (error) {
    return { error: "Could not save your banner theme — try again." };
  }

  revalidateProviderStorefront(profile.id);
  return { success: "Banner theme saved." };
}

/**
 * Save the provider's optional banner photo. While present it overrides the
 * chosen theme everywhere. Uses a fresh object path on each replacement to
 * avoid stale CDN copies, then deletes the previous photo.
 */
export async function uploadProviderBanner(
  _prev: ProviderSettingsFormState,
  formData: FormData,
): Promise<ProviderSettingsFormState> {
  await requireRole("provider");
  const profile = await getOwnProviderProfile();
  if (!profile) redirect("/provider/onboarding/account");

  const image = formData.get("image");
  if (!(image instanceof File) || image.size === 0) {
    return { error: "Choose a photo to upload." };
  }
  if (image.size > MAX_IMAGE_UPLOAD_BYTES) {
    return { error: "Choose an image smaller than 5 MB." };
  }
  const extension = IMAGE_UPLOAD_EXTENSION[image.type];
  if (!extension) {
    return { error: "Use a JPG, PNG, or WebP image." };
  }

  const supabase = await createClient();
  const path = `${profile.user_id}/${randomUUID()}.${extension}`;
  const { error: uploadError } = await supabase.storage
    .from(PROVIDER_BANNERS_BUCKET)
    .upload(path, image, {
      cacheControl: "31536000",
      contentType: image.type,
      upsert: false,
    });

  if (uploadError) {
    return { error: `Photo upload failed: ${uploadError.message}` };
  }

  const { error: updateError } = await supabase
    .from("provider_profiles")
    .update({ banner_image_path: path })
    .eq("id", profile.id);

  if (updateError) {
    await supabase.storage.from(PROVIDER_BANNERS_BUCKET).remove([path]);
    return { error: "Could not save that photo — please try again." };
  }

  if (profile.banner_image_path) {
    await supabase.storage
      .from(PROVIDER_BANNERS_BUCKET)
      .remove([profile.banner_image_path]);
  }

  revalidateProviderStorefront(profile.id);
  return { success: "Banner photo saved." };
}

/** Remove the banner photo, reverting the banner to the chosen theme. */
export async function removeProviderBanner(
  // Bound via useActionState, so it keeps the (prevState, formData) shape even
  // though a removal needs neither.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _prev: ProviderSettingsFormState,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _formData: FormData,
): Promise<ProviderSettingsFormState> {
  await requireRole("provider");
  const profile = await getOwnProviderProfile();
  if (!profile) redirect("/provider/onboarding/account");

  if (!profile.banner_image_path) {
    return { error: "There is no banner photo to remove." };
  }

  const path = profile.banner_image_path;
  const supabase = await createClient();
  const { error: updateError } = await supabase
    .from("provider_profiles")
    .update({ banner_image_path: null })
    .eq("id", profile.id);
  if (updateError) return { error: "Could not remove that photo — try again." };

  await supabase.storage.from(PROVIDER_BANNERS_BUCKET).remove([path]);
  revalidateProviderStorefront(profile.id);
  return { success: "Banner photo removed — your theme is back." };
}

/**
 * Save the provider's required public profile photo. One photo per provider,
 * shared across every offering. Uses a fresh object path on each replacement to
 * avoid stale CDN copies, then deletes the previous photo. There is no removal
 * counterpart on purpose — the photo is required to stay publicly visible.
 */
export async function uploadProviderAvatar(
  _prev: ProviderSettingsFormState,
  formData: FormData,
): Promise<ProviderSettingsFormState> {
  await requireRole("provider");
  const profile = await getOwnProviderProfile();
  if (!profile) redirect("/provider/onboarding/account");

  const image = formData.get("image");
  if (!(image instanceof File) || image.size === 0) {
    return { error: "Choose a photo to upload." };
  }
  if (image.size > MAX_IMAGE_UPLOAD_BYTES) {
    return { error: "Choose an image smaller than 5 MB." };
  }
  const extension = IMAGE_UPLOAD_EXTENSION[image.type];
  if (!extension) {
    return { error: "Use a JPG, PNG, or WebP image." };
  }

  const supabase = await createClient();
  const path = `${profile.user_id}/${randomUUID()}.${extension}`;
  const { error: uploadError } = await supabase.storage
    .from(PROVIDER_AVATARS_BUCKET)
    .upload(path, image, {
      cacheControl: "31536000",
      contentType: image.type,
      upsert: false,
    });

  if (uploadError) {
    return { error: `Photo upload failed: ${uploadError.message}` };
  }

  const { error: updateError } = await supabase
    .from("provider_profiles")
    .update({ avatar_image_path: path })
    .eq("id", profile.id);

  if (updateError) {
    await supabase.storage.from(PROVIDER_AVATARS_BUCKET).remove([path]);
    return { error: "Could not save that photo — please try again." };
  }

  if (profile.avatar_image_path) {
    await supabase.storage
      .from(PROVIDER_AVATARS_BUCKET)
      .remove([profile.avatar_image_path]);
  }

  revalidateProviderStorefront(profile.id);
  return { success: "Profile photo saved." };
}
