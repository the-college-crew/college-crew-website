"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireRole } from "@/lib/auth/session";
import {
  BOOKING_COPY_BY_KEY,
  validateBookingCopyValue,
} from "@/lib/content/booking-copy";
import { hasServiceRoleEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Inline copy editing (mini-CMS). site_content rows are overrides on top of
 * the defaults hardcoded in the pages; writes are server-only (no client
 * policies), so these use the service-role client — always AFTER the
 * requireRole("admin") check. Errors come back as values (not throws) because
 * the caller is an inline editor that shows them next to the text.
 */

/** Pages whose copy is editable; the prefix maps a key to its route. */
const PAGE_PATHS: Record<string, string> = {
  home: "/",
  about: "/about",
  "about-students": "/about/students",
  "about-customers": "/about/customers",
  blog: "/blog",
  browse: "/browse",
};

const keySchema = z
  .string()
  .max(120)
  .regex(
    /^(home|about|about-students|about-customers|blog|browse|footer)(\.[a-z0-9-]+)+$/,
  );

const valueSchema = z.string().trim().min(1).max(4000);

export type SiteContentResult = { ok: true } | { ok: false; error: string };

export async function updateSiteContent(
  key: string,
  value: string,
): Promise<SiteContentResult> {
  const session = await requireRole("admin");
  if (!hasServiceRoleEnv()) {
    return { ok: false, error: "Server key missing — check .env.local" };
  }

  const parsedKey = keySchema.safeParse(key);
  const parsedValue = valueSchema.safeParse(value);
  let safeKey: string;
  let safeValue: string;
  if (parsedKey.success) {
    if (!parsedValue.success) {
      return { ok: false, error: "Text must be 1–4000 characters" };
    }
    safeKey = parsedKey.data;
    safeValue = parsedValue.data;
  } else {
    const bookingCopy = validateBookingCopyValue(key, value);
    if (!bookingCopy.ok) return { ok: false, error: bookingCopy.error };
    safeKey = bookingCopy.key;
    safeValue = bookingCopy.value;
  }

  const admin = createAdminClient();
  const { error } = await admin.from("site_content").upsert({
    key: safeKey,
    value: safeValue,
    updated_by: session.user.id,
    updated_at: new Date().toISOString(),
  });
  if (error) return { ok: false, error: "Could not save — try again" };

  revalidateFor(safeKey);
  return { ok: true };
}

/** Delete the override so the key falls back to the default in code. */
export async function resetSiteContent(
  key: string,
): Promise<SiteContentResult> {
  await requireRole("admin");
  if (!hasServiceRoleEnv()) {
    return { ok: false, error: "Server key missing — check .env.local" };
  }

  const parsedKey = keySchema.safeParse(key);
  const bookingKey = key in BOOKING_COPY_BY_KEY ? key : null;
  if (!parsedKey.success && !bookingKey) {
    return { ok: false, error: "Unknown content key" };
  }
  const safeKey = parsedKey.success ? parsedKey.data : bookingKey!;

  const admin = createAdminClient();
  const { error } = await admin
    .from("site_content")
    .delete()
    .eq("key", safeKey);
  if (error) return { ok: false, error: "Could not reset — try again" };

  revalidateFor(safeKey);
  return { ok: true };
}

function revalidateFor(key: string) {
  const bookingField =
    BOOKING_COPY_BY_KEY[key as keyof typeof BOOKING_COPY_BY_KEY];
  if (bookingField) {
    for (const route of bookingField.livePaths) {
      if ("type" in route && route.type) {
        revalidatePath(route.path, route.type);
      } else {
        revalidatePath(route.path);
      }
    }
    revalidatePath("/admin/booking-copy");
    return;
  }
  const prefix = key.split(".")[0];
  if (prefix === "footer") {
    // The footer renders in the customer layout, on every page under it.
    revalidatePath("/", "layout");
    return;
  }
  revalidatePath(PAGE_PATHS[prefix] ?? "/");
}
