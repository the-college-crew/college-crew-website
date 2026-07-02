"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireRole } from "@/lib/auth/session";
import { hasServiceRoleEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Founder actions. Verification status and the service catalog are
 * server-written only (column grants / no client policies), so these use
 * the service-role client — always AFTER the requireRole("admin") check.
 */

async function setVerification(
  formData: FormData,
  status: "approved" | "rejected",
) {
  await requireRole("admin");
  if (!hasServiceRoleEnv()) {
    redirect("/admin/providers?err=env");
  }

  const providerId = z.string().uuid().parse(formData.get("providerId"));
  const admin = createAdminClient();
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

/** Flips the provider live in Browse and unlocks Stripe connection. */
export async function approveProvider(formData: FormData) {
  await setVerification(formData, "approved");
}

export async function rejectProvider(formData: FormData) {
  await setVerification(formData, "rejected");
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
