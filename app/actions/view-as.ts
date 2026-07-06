"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getSession, homePathFor, VIEW_AS_COOKIE } from "@/lib/auth/session";

const viewAsSchema = z.enum(["customer", "provider", "admin"]);

/**
 * Admin-only "view as" switcher (header pills). Sets the preview cookie and
 * jumps to that role's home. Preview only — Server Actions and RLS still run
 * as the admin's real identity, and getEffectiveRole() ignores the cookie for
 * non-admins, so a forged cookie does nothing.
 */
export async function setViewAs(formData: FormData) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.profile.role !== "admin") {
    redirect(homePathFor(session.profile.role));
  }

  const parsed = viewAsSchema.safeParse(formData.get("viewAs"));
  if (!parsed.success) redirect("/admin");

  const cookieStore = await cookies();
  cookieStore.set(VIEW_AS_COOKIE, parsed.data, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
  });
  redirect(homePathFor(parsed.data));
}
