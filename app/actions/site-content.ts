"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireRole } from "@/lib/auth/session";
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
  if (!parsedKey.success) return { ok: false, error: "Unknown content key" };
  if (!parsedValue.success) {
    return { ok: false, error: "Text must be 1–4000 characters" };
  }

  const admin = createAdminClient();
  const { error } = await admin.from("site_content").upsert({
    key: parsedKey.data,
    value: parsedValue.data,
    updated_by: session.user.id,
    updated_at: new Date().toISOString(),
  });
  if (error) return { ok: false, error: "Could not save — try again" };

  revalidateFor(parsedKey.data);
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
  if (!parsedKey.success) return { ok: false, error: "Unknown content key" };

  const admin = createAdminClient();
  const { error } = await admin
    .from("site_content")
    .delete()
    .eq("key", parsedKey.data);
  if (error) return { ok: false, error: "Could not reset — try again" };

  revalidateFor(parsedKey.data);
  return { ok: true };
}

function revalidateFor(key: string) {
  const prefix = key.split(".")[0];
  if (prefix === "footer") {
    // The footer renders in the customer layout, on every page under it.
    revalidatePath("/", "layout");
    return;
  }
  revalidatePath(PAGE_PATHS[prefix] ?? "/");
}
