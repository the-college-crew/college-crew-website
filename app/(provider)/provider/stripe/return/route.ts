import { NextResponse } from "next/server";

import { getOwnProviderProfile, getSession } from "@/lib/auth/session";
import { syncProviderPayoutSnapshot } from "@/lib/provider/payout-readiness";

/** Stripe-hosted onboarding return: refresh the persisted recipient snapshot. */
export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.redirect(
      new URL("/login?next=/account", request.url),
    );
  }
  if (session.profile.role !== "provider") {
    return NextResponse.redirect(new URL("/", request.url));
  }

  const profile = await getOwnProviderProfile();
  if (!profile?.stripe_account_id) {
    return NextResponse.redirect(
      new URL("/account?stripe=incomplete", request.url),
    );
  }

  try {
    const result = await syncProviderPayoutSnapshot(profile);
    const status =
      result.configured && result.transfersActive ? "connected" : "incomplete";
    return NextResponse.redirect(new URL(`/account?stripe=${status}`, request.url));
  } catch {
    return NextResponse.redirect(
      new URL("/account?stripe=incomplete", request.url),
    );
  }
}
