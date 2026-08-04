import { NextResponse } from "next/server";

import { getOwnProviderProfile, getSession } from "@/lib/auth/session";
import { syncProviderPayoutSnapshot } from "@/lib/provider/payout-readiness";
import {
  getStripeSurfacePaths,
  parseStripeReturnSurface,
  stripeSurfaceStatusPath,
} from "@/lib/provider/stripe-return";

/** Stripe-hosted onboarding return: refresh the persisted recipient snapshot. */
export async function GET(request: Request) {
  const surface = parseStripeReturnSurface(
    new URL(request.url).searchParams.get("flow"),
  );
  const surfacePaths = getStripeSurfacePaths(surface);
  const session = await getSession();
  if (!session) {
    return NextResponse.redirect(
      new URL(
        `/login?next=${encodeURIComponent(surfacePaths.entryPath)}`,
        request.url,
      ),
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
      new URL(stripeSurfaceStatusPath(surface, "incomplete"), request.url),
    );
  }

  try {
    const result = await syncProviderPayoutSnapshot(profile);
    const status =
      result.configured && result.transfersActive ? "connected" : "incomplete";
    return NextResponse.redirect(
      new URL(stripeSurfaceStatusPath(surface, status), request.url),
    );
  } catch {
    return NextResponse.redirect(
      new URL(stripeSurfaceStatusPath(surface, "incomplete"), request.url),
    );
  }
}
