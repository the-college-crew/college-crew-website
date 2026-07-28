"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireRole } from "@/lib/auth/session";
import {
  getAdminProviderProfile,
  type AdminProviderProfile,
} from "@/lib/db/queries";
import { hasServiceRoleEnv } from "@/lib/env";
import { hasAcceptedCurrentLegalDocument } from "@/lib/legal/acceptance";
import { PROVIDER_TERMS_VERSION } from "@/lib/legal/waivers";
import { PROVIDER_AVATARS_BUCKET } from "@/lib/media/provider-avatars";
import {
  isOwnProviderPhotoPath,
  PROVIDER_PHOTO_EXTENSION,
} from "@/lib/media/provider-photos";
import { uploadedObjectExists } from "@/lib/media/uploaded-object";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Founder actions. Verification status, the service catalog, and admin
 * overrides of provider copy are server-written only (column grants / no
 * client policies), so these use the service-role client — always AFTER the
 * requireRole("admin") check.
 */

const statusSchema = z.enum(["pending", "approved", "rejected"]);
const booleanSchema = z.enum(["true", "false"]).transform((value) => value === "true");

/** Admin may set the provider's normal listing preference; they can later turn it back on. */
export async function setProviderActivity(formData: FormData) {
  await requireRole("admin");
  if (!hasServiceRoleEnv()) redirect("/admin/providers?err=env");

  const providerId = z.string().uuid().parse(formData.get("providerId"));
  const isActive = booleanSchema.parse(formData.get("isActive"));
  const { error } = await createAdminClient()
    .from("provider_profiles")
    .update({ is_active: isActive })
    .eq("id", providerId);
  if (error) throw new Error(`Could not update listing status: ${error.message}`);

  revalidatePath("/admin/providers");
  revalidatePath("/account");
  revalidatePath("/provider/dashboard");
  revalidatePath("/browse");
  revalidatePath("/");
}

/** Founder-only lock. While set, the provider cannot reactivate their listing. */
export async function setProviderForcedInactive(formData: FormData) {
  await requireRole("admin");
  if (!hasServiceRoleEnv()) redirect("/admin/providers?err=env");

  const providerId = z.string().uuid().parse(formData.get("providerId"));
  const forcedInactive = booleanSchema.parse(formData.get("forcedInactive"));
  const { error } = await createAdminClient()
    .from("provider_profiles")
    .update({ admin_forced_inactive: forcedInactive })
    .eq("id", providerId);
  if (error) throw new Error(`Could not update inactive lock: ${error.message}`);

  revalidatePath("/admin/providers");
  revalidatePath("/account");
  revalidatePath("/provider/dashboard");
  revalidatePath("/browse");
  revalidatePath("/");
}

/**
 * Set a provider's verification status to any state. Approving still requires
 * a verified school (.edu) email, both sides of an ID document, and current
 * legal acceptance; re-opening or rejecting has no such gate.
 */
export async function setProviderStatus(formData: FormData) {
  await requireRole("admin");
  if (!hasServiceRoleEnv()) {
    redirect("/admin/providers?err=env");
  }

  const providerId = z.string().uuid().parse(formData.get("providerId"));
  const status = statusSchema.parse(formData.get("status"));
  const admin = createAdminClient();

  if (status === "approved") {
    const { data: prof } = await admin
      .from("provider_profiles")
      .select("user_id, id_document_url, id_document_back_url, school_name")
      .eq("id", providerId)
      .maybeSingle();
    if (prof) {
      if (!prof.id_document_url || !prof.id_document_back_url) {
        redirect("/admin/providers?err=identity");
      }
      if (!prof.school_name.trim()) {
        redirect("/admin/providers?err=school");
      }
      const [
        { data: school },
        platformTermsAccepted,
        providerTermsAccepted,
      ] = await Promise.all([
        admin
          .from("provider_school_emails")
          .select("user_id")
          .eq("user_id", prof.user_id)
          .maybeSingle(),
        hasAcceptedCurrentLegalDocument(admin, {
          userId: prof.user_id,
          kind: "platform_terms",
        }),
        hasAcceptedCurrentLegalDocument(admin, {
          userId: prof.user_id,
          kind: "provider_terms",
        }),
      ]);
      if (!school) {
        redirect("/admin/providers?err=unverified");
      }
      if (!platformTermsAccepted || !providerTermsAccepted) {
        redirect("/admin/providers?err=legal");
      }
    }
  }

  const { error } = await admin
    .from("provider_profiles")
    .update({ verification_status: status })
    .eq("id", providerId);
  if (error) {
    throw new Error(`Could not update verification: ${error.message}`);
  }

  revalidatePath("/admin/providers");
  revalidatePath("/browse");
}

/**
 * Admin override that approves a provider without a verified school email or
 * ID document — for a founder personally vouching for someone the automated
 * checks can't clear. This approves identity only; it never records or waives
 * legal acceptance. Stripe, booking actions, and public bookability continue
 * to enforce the current provider agreement independently. Records who
 * bypassed and when so the decision remains auditable.
 */
export async function bypassProviderVerification(formData: FormData) {
  const session = await requireRole("admin");
  if (!hasServiceRoleEnv()) {
    redirect("/admin/providers?err=env");
  }

  const providerId = z.string().uuid().parse(formData.get("providerId"));
  const admin = createAdminClient();

  const { data: prof } = await admin
    .from("provider_profiles")
    .select("id, school_name")
    .eq("id", providerId)
    .maybeSingle();
  if (!prof) {
    redirect("/admin/providers?err=notfound");
  }
  if (!prof.school_name.trim()) {
    redirect("/admin/providers?err=school");
  }

  const { error } = await admin
    .from("provider_profiles")
    .update({
      verification_status: "approved",
      verification_bypassed: true,
      verification_bypassed_at: new Date().toISOString(),
      verification_bypassed_by: session.profile.id,
    })
    .eq("id", providerId);
  if (error) {
    throw new Error(`Could not bypass verification: ${error.message}`);
  }

  revalidatePath("/admin/providers");
  revalidatePath("/provider/onboarding/verify");
  revalidatePath("/provider/onboarding/review");
  revalidatePath("/provider/dashboard");
  revalidatePath("/account");
  revalidatePath("/browse");
}

/** Service curation: toggle what's offered platform-wide (SPEC §8). */
export async function toggleServiceLive(formData: FormData) {
  await requireRole("admin");
  if (!hasServiceRoleEnv()) {
    redirect("/admin/services?err=env");
  }

  const serviceId = z.string().uuid().parse(formData.get("serviceId"));
  const nextLive = formData.get("nextLive") === "true";

  const admin = createAdminClient();
  const { error } = await admin
    .from("services")
    .update({ is_live: nextLive })
    .eq("id", serviceId);
  if (error) {
    throw new Error(`Could not update the service: ${error.message}`);
  }

  revalidatePath("/admin/services");
  revalidatePath("/browse");
  revalidatePath("/");
}

const providerTextFieldSchema = z.enum(["display_name", "bio", "company_name"]);
const providerTextValueSchema = z.string().trim().max(2000);

export type ProviderTextResult = { ok: true } | { ok: false; error: string };

/**
 * Admin override of a provider's free-text profile fields (display_name, bio)
 * so inappropriate content can be removed. Field is allowlisted; errors come
 * back as values (not throws) because the caller is an inline editor that
 * shows them next to the text.
 */
export async function updateProviderText(
  formData: FormData,
): Promise<ProviderTextResult> {
  await requireRole("admin");
  if (!hasServiceRoleEnv()) {
    return { ok: false, error: "Server key missing — check .env.local" };
  }

  const parsedId = z.string().uuid().safeParse(formData.get("providerId"));
  const parsedField = providerTextFieldSchema.safeParse(formData.get("field"));
  const parsedValue = providerTextValueSchema.safeParse(formData.get("value"));
  if (!parsedId.success) return { ok: false, error: "Unknown provider" };
  if (!parsedField.success) return { ok: false, error: "Unknown field" };
  if (!parsedValue.success) {
    return { ok: false, error: "Text must be 2000 characters or fewer" };
  }

  // Build a typed update so the column is a known key, not a string index.
  const update =
    parsedField.data === "display_name"
      ? { display_name: parsedValue.data }
      : parsedField.data === "bio"
        ? { bio: parsedValue.data }
        : { company_name: parsedValue.data || null };

  const admin = createAdminClient();
  const { error } = await admin
    .from("provider_profiles")
    .update(update)
    .eq("id", parsedId.data);
  if (error) return { ok: false, error: "Could not save — try again" };

  revalidatePath("/admin/providers");
  revalidatePath("/browse");
  return { ok: true };
}

export type AdminAvatarUploadResult =
  | { ok: true; path: string; token: string }
  | { ok: false; error: string };

export type AdminAvatarSaveResult =
  | { ok: true; path: string; x: number; y: number }
  | { ok: false; error: string };

const adminAvatarUploadSchema = z.object({
  providerId: z.string().uuid(),
  contentType: z.enum(["image/jpeg", "image/png", "image/webp"]),
});

const adminAvatarSaveSchema = z.object({
  providerId: z.string().uuid(),
  path: z.string().trim().default(""),
  x: z.coerce.number().min(0).max(100),
  y: z.coerce.number().min(0).max(100),
});

/**
 * Mint a one-time upload capability for an admin replacing a provider avatar.
 * The service-role credential stays on the server; the browser receives only
 * a signed token scoped to the freshly generated object path.
 */
export async function createAdminProviderAvatarUpload(
  formData: FormData,
): Promise<AdminAvatarUploadResult> {
  await requireRole("admin");
  if (!hasServiceRoleEnv()) {
    return { ok: false, error: "Server key missing. Check .env.local." };
  }

  const parsed = adminAvatarUploadSchema.safeParse({
    providerId: formData.get("providerId"),
    contentType: formData.get("contentType"),
  });
  if (!parsed.success) {
    return { ok: false, error: "Choose a valid JPG, PNG, or WebP image." };
  }

  const admin = createAdminClient();
  const { data: profile, error: profileError } = await admin
    .from("provider_profiles")
    .select("user_id")
    .eq("id", parsed.data.providerId)
    .maybeSingle();
  if (profileError || !profile) {
    return { ok: false, error: "That provider could not be found." };
  }

  const extension = PROVIDER_PHOTO_EXTENSION[parsed.data.contentType];
  const path = `${profile.user_id}/${crypto.randomUUID()}.${extension}`;
  const { data, error } = await admin.storage
    .from(PROVIDER_AVATARS_BUCKET)
    .createSignedUploadUrl(path);
  if (error || !data?.token) {
    return { ok: false, error: "Could not prepare that upload. Try again." };
  }

  return { ok: true, path, token: data.token };
}

/**
 * Save an admin-adjusted avatar crop and optionally promote a newly uploaded
 * replacement. A replacement is verified before the database pointer changes;
 * the old object is deleted only after the row update succeeds.
 */
export async function saveAdminProviderAvatar(
  formData: FormData,
): Promise<AdminAvatarSaveResult> {
  await requireRole("admin");
  if (!hasServiceRoleEnv()) {
    return { ok: false, error: "Server key missing. Check .env.local." };
  }

  const parsed = adminAvatarSaveSchema.safeParse({
    providerId: formData.get("providerId"),
    path: formData.get("path") ?? "",
    x: formData.get("x"),
    y: formData.get("y"),
  });
  if (!parsed.success) {
    return { ok: false, error: "Choose a valid photo position." };
  }

  const admin = createAdminClient();
  const { data: profile, error: profileError } = await admin
    .from("provider_profiles")
    .select("user_id, avatar_image_path")
    .eq("id", parsed.data.providerId)
    .maybeSingle();
  if (profileError || !profile) {
    return { ok: false, error: "That provider could not be found." };
  }

  const replacementPath = parsed.data.path || null;
  if (
    replacementPath &&
    (!isOwnProviderPhotoPath(replacementPath, profile.user_id) ||
      !(await uploadedObjectExists(PROVIDER_AVATARS_BUCKET, replacementPath)))
  ) {
    return { ok: false, error: "That replacement did not finish uploading." };
  }
  if (!replacementPath && !profile.avatar_image_path) {
    return { ok: false, error: "Choose a profile photo first." };
  }

  const x = Math.round(parsed.data.x);
  const y = Math.round(parsed.data.y);
  const nextPath = replacementPath ?? profile.avatar_image_path;
  if (!nextPath) {
    return { ok: false, error: "Choose a profile photo first." };
  }
  const { data: updated, error: updateError } = await admin
    .from("provider_profiles")
    .update({
      avatar_image_path: nextPath,
      avatar_focal_x: x,
      avatar_focal_y: y,
    })
    .eq("id", parsed.data.providerId)
    .select("id")
    .maybeSingle();

  if (updateError || !updated) {
    if (replacementPath) {
      await admin.storage.from(PROVIDER_AVATARS_BUCKET).remove([replacementPath]);
    }
    return { ok: false, error: "Could not save that profile photo." };
  }

  if (
    replacementPath &&
    profile.avatar_image_path &&
    profile.avatar_image_path !== replacementPath
  ) {
    await admin.storage
      .from(PROVIDER_AVATARS_BUCKET)
      .remove([profile.avatar_image_path]);
  }

  revalidatePath("/admin/providers");
  revalidatePath("/browse");
  revalidatePath("/");
  revalidatePath("/account");
  revalidatePath(`/providers/${parsed.data.providerId}`);

  return { ok: true, path: nextPath, x, y };
}

export type AdminProviderDetail = {
  profile: AdminProviderProfile;
  schoolEmail: string | null;
  hasCurrentLegalAcceptance: boolean;
  legalContentVersion: string;
  idDocumentUrl: string | null;
  idDocumentBackUrl: string | null;
};

/**
 * Full detail for the admin profile popup, fetched lazily when a provider is
 * opened. Bundles the profile with the verified school email and a fresh
 * short-lived signed URL to the private ID document (both service-role reads),
 * so the list payload stays light and the ID link never goes stale.
 */
export async function loadAdminProviderProfile(
  providerId: string,
): Promise<AdminProviderDetail | null> {
  await requireRole("admin");

  const parsedId = z.string().uuid().safeParse(providerId);
  if (!parsedId.success) return null;

  const profile = await getAdminProviderProfile(parsedId.data);
  if (!profile) return null;

  let schoolEmail: string | null = null;
  let hasCurrentLegalAcceptance = false;
  let idDocumentUrl: string | null = null;
  let idDocumentBackUrl: string | null = null;

  if (hasServiceRoleEnv()) {
    const admin = createAdminClient();

    const { data: prof } = await admin
      .from("provider_profiles")
      .select("user_id")
      .eq("id", parsedId.data)
      .maybeSingle();
    if (prof) {
      const [{ data: school }, legalReady] = await Promise.all([
        admin
          .from("provider_school_emails")
          .select("email")
          .eq("user_id", prof.user_id)
          .maybeSingle(),
        hasAcceptedCurrentLegalDocument(admin, {
          userId: prof.user_id,
          kind: "provider_terms",
        }),
      ]);
      schoolEmail = school?.email ?? null;
      hasCurrentLegalAcceptance = legalReady;
    }

    const signIdDoc = async (path: string | null) => {
      if (!path) return null;
      const { data } = await admin.storage
        .from("id-documents")
        .createSignedUrl(path, 60 * 60);
      return data?.signedUrl ?? null;
    };
    [idDocumentUrl, idDocumentBackUrl] = await Promise.all([
      signIdDoc(profile.id_document_url),
      signIdDoc(profile.id_document_back_url),
    ]);
  }

  return {
    profile,
    schoolEmail,
    hasCurrentLegalAcceptance,
    legalContentVersion: PROVIDER_TERMS_VERSION,
    idDocumentUrl,
    idDocumentBackUrl,
  };
}
