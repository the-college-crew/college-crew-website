"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { z } from "zod";

import {
  getOwnProviderProfile,
  requireProviderAccess,
} from "@/lib/auth/session";
import { PROVIDER_AVATARS_BUCKET } from "@/lib/media/provider-avatars";
import { isOwnProviderPhotoPath } from "@/lib/media/provider-photos";
import { uploadedObjectExists } from "@/lib/media/uploaded-object";
import {
  BANNER_STYLES,
  PROVIDER_BANNERS_BUCKET,
  type BannerStyle,
} from "@/lib/media/provider-banners";
import {
  resolveSchoolProfileInput,
  SchoolDirectoryError,
} from "@/lib/education/schools";
import { screenProfileText } from "@/lib/moderation/profile-text";
import { parseProviderAvailabilityForm } from "@/lib/provider/setup";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

import { savePricingRows } from "@/app/(provider)/provider/_lib/pricing";
import type { AvailabilityFormState } from "@/app/(provider)/provider/_components/provider-availability-form";

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
  schoolName: z
    .string()
    .trim()
    .min(1, "Enter your college or university.")
    .max(160),
  schoolId: z
    .union([z.literal(""), z.string().trim().regex(/^\d+$/)])
    .default(""),
  greekOrganization: z.string().trim().max(120).optional().default(""),
});

/** Storefront fields — these render directly on the public profile. */
export async function updateProviderProfile(
  _prev: ProviderSettingsFormState,
  formData: FormData,
): Promise<ProviderSettingsFormState> {
  await requireProviderAccess();
  const profile = await getOwnProviderProfile();
  if (!profile) redirect("/provider/onboarding/account");

  const parsed = profileSchema.safeParse({
    displayName: formData.get("displayName"),
    companyName: formData.get("companyName"),
    providerType: formData.get("providerType"),
    neighborhood: formData.get("neighborhood"),
    bio: formData.get("bio"),
    schoolName: formData.get("schoolName"),
    schoolId: formData.get("schoolId") ?? "",
    greekOrganization: formData.get("greekOrganization"),
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
  let school;
  try {
    school = await resolveSchoolProfileInput(parsed.data, profile);
  } catch (error) {
    return {
      error:
        error instanceof SchoolDirectoryError
          ? error.message
          : "Could not save your school. Try again.",
    };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("provider_profiles")
    .update({
      display_name: parsed.data.displayName,
      company_name: companyName,
      provider_type: parsed.data.providerType,
      neighborhood: parsed.data.neighborhood,
      bio: parsed.data.bio,
      ...school,
    })
    .eq("id", profile.id);
  if (error) {
    return { error: "Could not save your profile. Try again." };
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
    { field: "school_name", text: school.school_name, before: profile.school_name },
    {
      field: "greek_organization",
      text: school.greek_organization,
      before: profile.greek_organization,
    },
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

/** Structured per-day pilot availability and private service area. */
export async function updateAvailability(
  _prev: AvailabilityFormState,
  formData: FormData,
): Promise<AvailabilityFormState> {
  await requireProviderAccess();
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
  if (error) {
    return { error: "Could not save availability. Try again." };
  }

  revalidateProviderStorefront(profile.id);
  revalidatePath("/provider/dashboard");
  return { success: "Availability saved." };
}

export type AvailabilityOverrideState = { error?: string; success?: string };

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

const overrideSchema = z
  .object({
    localDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date."),
    mode: z.enum(["closed", "custom", "clear"]),
    /** JSON array of {start,end}; a date may carry several periods. */
    periods: z
      .string()
      .transform((raw, ctx) => {
        try {
          return z
            .array(z.object({ start: z.string().regex(TIME), end: z.string().regex(TIME) }))
            .max(4)
            .parse(JSON.parse(raw || "[]"));
        } catch {
          ctx.addIssue({ code: "custom", message: "Pick the hours you'll work that day." });
          return z.NEVER;
        }
      }),
  })
  .refine(
    (value) =>
      value.mode !== "custom" ||
      (value.periods.length > 0 &&
        value.periods.every((period) => period.start < period.end)),
    { message: "Pick the hours you'll work that day." },
  );

/**
 * One-date exception to the weekly hours: close the day, give it custom hours,
 * or drop the exception so it falls back to the usual week.
 */
export async function saveAvailabilityOverride(
  _prev: AvailabilityOverrideState,
  formData: FormData,
): Promise<AvailabilityOverrideState> {
  await requireProviderAccess();
  const profile = await getOwnProviderProfile();
  if (!profile) redirect("/provider/onboarding/account");

  const parsed = overrideSchema.safeParse({
    localDate: formData.get("localDate"),
    mode: formData.get("mode"),
    periods: String(formData.get("periods") ?? "[]"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const supabase = await createClient();
  const { error } =
    parsed.data.mode === "clear"
      ? await supabase.rpc("clear_provider_availability_override", {
          p_local_date: parsed.data.localDate,
        })
      : await supabase.rpc("save_provider_availability_override", {
          p_local_date: parsed.data.localDate,
          p_is_available: parsed.data.mode === "custom",
          p_periods: parsed.data.mode === "custom" ? parsed.data.periods : [],
        });
  if (error) {
    return {
      error: error.message.includes("INVALID_OVERRIDE_DATE")
        ? "That date is in the past or more than a year out."
        : error.message.includes("OVERLAPPING_AVAILABILITY_WINDOWS")
          ? "Those hours overlap each other. Adjust them and try again."
          : "Could not save that date. Try again.",
    };
  }

  revalidateProviderStorefront(profile.id);
  revalidatePath("/provider/dashboard");
  revalidatePath("/account");
  return {
    success:
      parsed.data.mode === "clear"
        ? "That date is back to your usual hours."
        : parsed.data.mode === "closed"
          ? "That date is closed."
          : "Custom hours saved for that date.",
  };
}

/** Pricing source of truth (SPEC §3) — Jobs & pricing shows it read-only. */
export async function saveSettingsPricing(
  _prev: ProviderSettingsFormState,
  formData: FormData,
): Promise<ProviderSettingsFormState> {
  await requireProviderAccess();
  const profile = await getOwnProviderProfile();
  if (!profile) redirect("/provider/onboarding/account");

  const result = await savePricingRows(profile.id, formData);
  if (result.error || result.fieldErrors) {
    return { error: result.error, fieldErrors: result.fieldErrors };
  }

  revalidateProviderStorefront(profile.id);
  revalidatePath("/provider/jobs");
  revalidatePath("/provider/dashboard");
  return { success: "Hourly rates saved. Your public profile is updated." };
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
  await requireProviderAccess();
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
    return { error: "Could not save your banner theme. Try again." };
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
  path: string,
): Promise<ProviderSettingsFormState> {
  await requireProviderAccess();
  const profile = await getOwnProviderProfile();
  if (!profile) redirect("/provider/onboarding/account");

  // The browser uploads the bytes and sends only the object key, so validate
  // the key is this user's own and points at an object that actually landed.
  if (!isOwnProviderPhotoPath(path, profile.user_id)) {
    return { error: "That upload didn't go through. Please try again." };
  }
  if (!(await uploadedObjectExists(PROVIDER_BANNERS_BUCKET, path))) {
    return { error: "That photo didn't finish uploading. Please try again." };
  }

  const supabase = await createClient();
  const { error: updateError } = await supabase
    .from("provider_profiles")
    // A new photo has an unknown composition, so any focal point saved
    // against the old one would be meaningless (and invisibly wrong) against
    // this one -- reset to center rather than carry it over.
    .update({ banner_image_path: path, banner_focal_x: 50, banner_focal_y: 50 })
    .eq("id", profile.id);

  if (updateError) {
    await supabase.storage.from(PROVIDER_BANNERS_BUCKET).remove([path]);
    return { error: "Could not save that photo. Please try again." };
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
  await requireProviderAccess();
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
  if (updateError) return { error: "Could not remove that photo. Try again." };

  await supabase.storage.from(PROVIDER_BANNERS_BUCKET).remove([path]);
  revalidateProviderStorefront(profile.id);
  return { success: "Banner photo removed. Your theme is back." };
}

/**
 * Save the provider's required public profile photo. One photo per provider,
 * shared across every offering. Uses a fresh object path on each replacement to
 * avoid stale CDN copies, then deletes the previous photo. There is no removal
 * counterpart on purpose — the photo is required to stay publicly visible.
 */
export async function uploadProviderAvatar(
  path: string,
): Promise<ProviderSettingsFormState> {
  await requireProviderAccess();
  const profile = await getOwnProviderProfile();
  if (!profile) redirect("/provider/onboarding/account");

  // The browser uploads the bytes and sends only the object key, so validate
  // the key is this user's own and points at an object that actually landed.
  if (!isOwnProviderPhotoPath(path, profile.user_id)) {
    return { error: "That upload didn't go through. Please try again." };
  }
  if (!(await uploadedObjectExists(PROVIDER_AVATARS_BUCKET, path))) {
    return { error: "That photo didn't finish uploading. Please try again." };
  }

  const supabase = await createClient();
  const { error: updateError } = await supabase
    .from("provider_profiles")
    // A new photo has an unknown composition, so any focal point saved
    // against the old one would be meaningless (and invisibly wrong) against
    // this one -- reset to center rather than carry it over.
    .update({ avatar_image_path: path, avatar_focal_x: 50, avatar_focal_y: 50 })
    .eq("id", profile.id);

  if (updateError) {
    await supabase.storage.from(PROVIDER_AVATARS_BUCKET).remove([path]);
    return { error: "Could not save that photo. Please try again." };
  }

  if (profile.avatar_image_path) {
    await supabase.storage
      .from(PROVIDER_AVATARS_BUCKET)
      .remove([profile.avatar_image_path]);
  }

  revalidateProviderStorefront(profile.id);
  return { success: "Profile photo saved." };
}

const focalPointSchema = z.object({
  x: z.coerce.number().min(0).max(100),
  y: z.coerce.number().min(0).max(100),
});

/** Save the avatar's drag-adjusted focal point (CSS object-position, 0-100%). */
export async function updateProviderAvatarFocalPoint(
  _prev: ProviderSettingsFormState,
  formData: FormData,
): Promise<ProviderSettingsFormState> {
  await requireProviderAccess();
  const profile = await getOwnProviderProfile();
  if (!profile) redirect("/provider/onboarding/account");

  const parsed = focalPointSchema.safeParse({
    x: formData.get("x"),
    y: formData.get("y"),
  });
  if (!parsed.success) return { error: "Invalid position." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("provider_profiles")
    .update({
      avatar_focal_x: Math.round(parsed.data.x),
      avatar_focal_y: Math.round(parsed.data.y),
    })
    .eq("id", profile.id);
  if (error) return { error: "Could not save that position. Try again." };

  revalidateProviderStorefront(profile.id);
  return { success: "Position saved." };
}

/** Save the banner's drag-adjusted focal point (CSS object-position, 0-100%). */
export async function updateProviderBannerFocalPoint(
  _prev: ProviderSettingsFormState,
  formData: FormData,
): Promise<ProviderSettingsFormState> {
  await requireProviderAccess();
  const profile = await getOwnProviderProfile();
  if (!profile) redirect("/provider/onboarding/account");

  const parsed = focalPointSchema.safeParse({
    x: formData.get("x"),
    y: formData.get("y"),
  });
  if (!parsed.success) return { error: "Invalid position." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("provider_profiles")
    .update({
      banner_focal_x: Math.round(parsed.data.x),
      banner_focal_y: Math.round(parsed.data.y),
    })
    .eq("id", profile.id);
  if (error) return { error: "Could not save that position. Try again." };

  revalidateProviderStorefront(profile.id);
  return { success: "Position saved." };
}
