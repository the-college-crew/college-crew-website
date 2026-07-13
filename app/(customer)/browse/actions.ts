"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { z } from "zod";

import { BROWSE_ZIP_COOKIE } from "@/lib/browse/preferences";

export async function setBrowseZip(formData: FormData) {
  const jobZip = z.string().trim().regex(/^\d{5}$/).parse(formData.get("jobZip"));
  const cookieStore = await cookies();
  cookieStore.set(BROWSE_ZIP_COOKIE, jobZip, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/browse",
    maxAge: 60 * 60 * 24 * 7,
  });
  revalidatePath("/browse");
}
