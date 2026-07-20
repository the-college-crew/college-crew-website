import { NextResponse } from "next/server";

import { getOwnProviderProfile, getSession } from "@/lib/auth/session";
import { syncProviderPayoutSnapshot } from "@/lib/provider/payout-readiness";

/** Stripe-hosted onboarding return: refresh the persisted recipient snapshot. */
export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.redirect(
      new URL("/login?next=/provider/dashboard", request.url),
    );
  }
  // Provider capability = owning a provider profile; admins and plain
  // customers have nothing to sync here.
  const profile = await getOwnProviderProfile();
  if (!profile) {
    return NextResponse.redirect(new URL("/", request.url));
  }
  if (!profile.stripe_account_id) {
    return NextResponse.redirect(
      new URL("/provider/dashboard?stripe=incomplete", request.url),
    );
  }

  try {
    const result = await syncProviderPayoutSnapshot(profile);
    const status =
      result.configured && result.transfersActive ? "connected" : "incomplete";
    return NextResponse.redirect(
      new URL(`/provider/dashboard?stripe=${status}`, request.url),
    );
  } catch {
    return NextResponse.redirect(
      new URL("/provider/dashboard?stripe=incomplete", request.url),
    );
  }
}
