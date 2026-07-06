"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireUser } from "@/lib/auth/session";
import type { BookingStatus } from "@/lib/db/types";
import { hasServiceRoleEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { addressSchema, passwordSchema } from "@/lib/validation/auth";

/**
 * Shared account actions — available to any signed-in user (customer, provider,
 * admin). Each gates with requireUser() and operates only on the caller's own
 * id; the delete path uses the service-role client to work around the
 * bookings-FK RESTRICT that blocks a plain user delete.
 */

export type AccountFormState = { error?: string; success?: string };

const profileSchema = z.object({
  fullName: z.string().trim().min(1, "Enter your name."),
  address_line1: addressSchema.shape.address_line1,
  address_line2: addressSchema.shape.address_line2,
  city: addressSchema.shape.city,
  state: addressSchema.shape.state,
  postal_code: addressSchema.shape.postal_code,
});

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

// In-flight bookings block deletion (money / commitment in play).
const ACTIVE_BOOKING_STATUSES: BookingStatus[] = [
  "requested",
  "accepted",
  "paid",
];

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

  // Refuse while any in-flight booking exists (as customer or provider).
  const { data: activeAsCustomer } = await admin
    .from("bookings")
    .select("id")
    .eq("customer_id", user.id)
    .in("status", ACTIVE_BOOKING_STATUSES)
    .limit(1);

  let hasActiveAsProvider = false;
  if (providerProfile) {
    const { data } = await admin
      .from("bookings")
      .select("id")
      .eq("provider_id", providerProfile.id)
      .in("status", ACTIVE_BOOKING_STATUSES)
      .limit(1);
    hasActiveAsProvider = (data?.length ?? 0) > 0;
  }

  if ((activeAsCustomer?.length ?? 0) > 0 || hasActiveAsProvider) {
    return {
      error:
        "You have active bookings. Cancel or complete them before deleting your account.",
    };
  }

  // Clear booking history so the RESTRICT FKs don't block the cascade
  // (reviews cascade off bookings automatically).
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
