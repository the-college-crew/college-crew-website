"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth/session";
import { hasServiceRoleEnv } from "@/lib/env";
import { geocodeProfileAddress } from "@/lib/geocode/profile";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { passwordSchema, profileSchema } from "@/lib/validation/auth";

/**
 * Shared account actions — available to any signed-in user (customer, provider,
 * admin). Each gates with requireUser() and operates only on the caller's own
 * id; the delete path uses the service-role client to work around the
 * bookings-FK RESTRICT that blocks a plain user delete.
 */

export type AccountFormState = { error?: string; success?: string };

export async function updateProfile(
  _prev: AccountFormState,
  formData: FormData,
): Promise<AccountFormState> {
  const user = await requireUser("/account");

  const parsed = profileSchema.safeParse({
    fullName: formData.get("fullName"),
    address_line1: formData.get("address_line1"),
    address_line2: formData.get("address_line2") ?? "",
    city: formData.get("city"),
    state: formData.get("state"),
    postal_code: formData.get("postal_code"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({
      full_name: parsed.data.fullName,
      address_line1: parsed.data.address_line1,
      address_line2: parsed.data.address_line2,
      city: parsed.data.city,
      state: parsed.data.state,
      postal_code: parsed.data.postal_code,
    })
    .eq("id", user.id);
  if (error) return { error: error.message };

  // Re-derive coordinates from the saved address (server-only write path).
  await geocodeProfileAddress(user.id, {
    line1: parsed.data.address_line1,
    city: parsed.data.city,
    state: parsed.data.state,
    zip: parsed.data.postal_code,
  });

  revalidatePath("/account");
  return { success: "Profile updated." };
}

export async function updatePassword(
  _prev: AccountFormState,
  formData: FormData,
): Promise<AccountFormState> {
  await requireUser("/account");

  const parsed = passwordSchema.safeParse(formData.get("password"));
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data });
  if (error) return { error: error.message };

  return { success: "Password updated." };
}

export async function deleteAccount(
  _prev: AccountFormState,
  formData: FormData,
): Promise<AccountFormState> {
  const user = await requireUser("/account");

  const confirm = formData.get("confirm");
  if (typeof confirm !== "string" || confirm.trim().toUpperCase() !== "DELETE") {
    return { error: "Type DELETE to confirm." };
  }
  if (!hasServiceRoleEnv()) {
    return {
      error: "Account deletion isn't available in this environment yet.",
    };
  }

  const admin = createAdminClient();

  const { data: providerProfile } = await admin
    .from("provider_profiles")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  // Hard delete: remove all of the user's bookings (as customer and as
  // provider). This is the "auto-cancel" the confirmation page warns about, and
  // it clears the RESTRICT FKs that would otherwise block the cascade. Reviews
  // cascade off bookings automatically.
  await admin.from("bookings").delete().eq("customer_id", user.id);
  if (providerProfile) {
    await admin.from("bookings").delete().eq("provider_id", providerProfile.id);
  }

  // Best-effort: remove the provider's ID documents (keyed by user id).
  // Storage has no FK, so nothing cascades these — a private bucket, so any
  // miss just orphans harmlessly.
  try {
    const { data: files } = await admin.storage
      .from("id-documents")
      .list(user.id);
    if (files?.length) {
      await admin.storage
        .from("id-documents")
        .remove(files.map((f) => `${user.id}/${f.name}`));
    }
  } catch {
    // non-fatal
  }

  // Removing the auth user cascades: profile, provider_profile, provider_services,
  // conversations, messages.
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) return { error: error.message };

  // Deleting a user doesn't invalidate the current cookie session — clear it.
  const supabase = await createClient();
  await supabase.auth.signOut();

  redirect("/goodbye");
}
