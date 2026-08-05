import { redirect } from "next/navigation";

import {
  getEffectiveRole,
  getSession,
  homePathFor,
} from "@/lib/auth/session";
import { getProviderOnboardingDestination } from "@/lib/provider/onboarding-destination";

/** One stable entry point for starting or resuming provider setup. */
export default async function ProviderOnboardingEntryPage() {
  const session = await getSession();
  if (!session) redirect("/provider/onboarding/account");

  if (session.profile.role === "admin") {
    redirect(homePathFor((await getEffectiveRole()) ?? "admin"));
  }

  redirect(await getProviderOnboardingDestination(session.user.id));
}
