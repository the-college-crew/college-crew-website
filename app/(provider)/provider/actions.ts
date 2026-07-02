"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getOwnProviderProfile, requireRole } from "@/lib/auth/session";
import type { BookingStatus } from "@/lib/db/types";
import { hasServiceRoleEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { createConnectOnboardingLink } from "@/lib/stripe/connect";

/**
 * Provider-side booking + Stripe actions. Booking updates run as the
 * signed-in user: RLS scopes them to this provider's bookings and the
 * database trigger enforces the state machine — even if this code is wrong.
 */

async function setBookingStatus(formData: FormData, status: BookingStatus) {
  await requireRole("provider");
  const bookingId = z.string().uuid().parse(formData.get("bookingId"));

  const supabase = await createClient();
  const { error } = await supabase
    .from("bookings")
    .update({ status })
    .eq("id", bookingId);
  if (error) {
    throw new Error(`Could not update the booking: ${error.message}`);
  }

  revalidatePath("/provider/dashboard");
  revalidatePath("/provider/jobs");
}

export async function acceptBooking(formData: FormData) {
  await setBookingStatus(formData, "accepted");
}

export async function declineBooking(formData: FormData) {
  await setBookingStatus(formData, "declined");
}

export async function completeBooking(formData: FormData) {
  await setBookingStatus(formData, "completed");
}

/**
 * Post-approval "Connect Stripe" (SPEC §6): hosted Express onboarding.
 * While the Stripe test account is unprovisioned this lands back on the
 * dashboard with a pending notice.
 */
export async function connectStripe() {
  await requireRole("provider");
  const profile = await getOwnProviderProfile();
  if (!profile || profile.verification_status !== "approved") {
    redirect("/provider/dashboard");
  }

  const headerList = await headers();
  const origin =
    headerList.get("origin") ??
    `https://${headerList.get("host") ?? "localhost:3000"}`;

  const result = await createConnectOnboardingLink({
    stripeAccountId: profile.stripe_account_id,
    refreshUrl: `${origin}/provider/dashboard?stripe=refresh`,
    returnUrl: `${origin}/provider/settings?stripe=connected`,
  });

  if (!result.configured) {
    redirect("/provider/dashboard?stripe=pending");
  }

  // stripe_account_id is server-written only (column grant), so persist it
  // with the service-role client after the ownership checks above.
  if (result.stripeAccountId !== profile.stripe_account_id) {
    const admin = createAdminClient();
    await admin
      .from("provider_profiles")
      .update({ stripe_account_id: result.stripeAccountId })
      .eq("id", profile.id);
  }

  redirect(result.url);
}

/**
 * Optional paid background check (SPEC §3) — trust badge + small margin.
 * The actual check flow is out of pilot scope; this just marks it requested
 * for founder follow-up.
 */
export async function requestBackgroundCheck() {
  await requireRole("provider");
  const profile = await getOwnProviderProfile();
  if (!profile || profile.background_check_status !== "none") {
    redirect("/provider/settings");
  }
  if (!hasServiceRoleEnv()) {
    redirect("/provider/settings?bgc=unavailable");
  }

  const admin = createAdminClient();
  await admin
    .from("provider_profiles")
    .update({ background_check_status: "pending" })
    .eq("id", profile.id);

  revalidatePath("/provider/settings");
  redirect("/provider/settings?bgc=requested");
}
