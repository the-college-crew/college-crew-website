import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { needsProfileCompletion, safeNext } from "@/lib/auth/redirects";
import { postAuthDestination } from "@/lib/auth/post-auth";
import { getSession } from "@/lib/auth/session";

import { CompleteProfileForm } from "./complete-profile-form";

export const metadata: Metadata = { title: "Complete your profile" };

export default async function CompleteProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const [{ next: nextParam }, session] = await Promise.all([
    searchParams,
    getSession(),
  ]);
  const next =
    nextParam === "/complete-profile" ? "/dashboard" : safeNext(nextParam);

  if (!session) {
    const completionPath = `/complete-profile?next=${encodeURIComponent(next)}`;
    redirect(`/login?next=${encodeURIComponent(completionPath)}`);
  }
  if (session.profile.role === "admin") redirect("/admin");
  if (!needsProfileCompletion(session.profile)) {
    redirect(await postAuthDestination(next));
  }

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold">
        Complete your profile
      </h1>
      <p className="mt-1 text-sm text-ink-soft">
        Google shared your name and email. Add your address so College Crew can
        match bookings within the pilot service area.
      </p>

      <div className="mt-6">
        <CompleteProfileForm profile={session.profile} next={next} />
      </div>
    </div>
  );
}
