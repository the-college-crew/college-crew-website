import "server-only";

import { createHash } from "node:crypto";

import { headers } from "next/headers";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, UserRole } from "@/lib/db/types";
import {
  getMasterAgreementSnapshot,
  LEGAL_CONTENT_VERSION,
} from "@/lib/legal/waivers";

export function stableContentHash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export async function requestAuditFields() {
  const headerList = await headers();
  const forwardedFor = headerList.get("x-forwarded-for");
  const ip =
    forwardedFor?.split(",")[0]?.trim() ??
    headerList.get("x-real-ip") ??
    null;

  return {
    ip_address: ip,
    user_agent: headerList.get("user-agent"),
  };
}

export function safeNextPath(value: FormDataEntryValue | string | null | undefined) {
  if (typeof value !== "string") return "/";
  if (!value.startsWith("/") || value.startsWith("//")) return "/";
  if (value === "/legal/master" || value.startsWith("/legal/master?")) {
    return "/";
  }
  return value;
}

export function masterAgreementPath(next?: string) {
  const safeNext = safeNextPath(next);
  return `/legal/master?next=${encodeURIComponent(safeNext)}`;
}

/**
 * Which master-agreement variant (section set) a user must have accepted.
 * `legal_acceptances.role` stores the accepted VARIANT, not the account role:
 * provider-capable accounts owe the provider variant, everyone else the
 * customer one; admins keep their own founder variant.
 */
export function requiredMasterVariant(
  role: UserRole,
  providerCapable: boolean,
): UserRole {
  if (role === "admin") return "admin";
  return providerCapable ? "provider" : "customer";
}

export async function hasAcceptedCurrentMasterAgreement(
  supabase: SupabaseClient<Database>,
  input: { userId: string; variant: UserRole },
) {
  // The provider variant contains every customer section plus the provider
  // ones, so a provider acceptance satisfies customer-level requirements
  // (mirrors private.has_current_master_agreement in the database).
  const variants: UserRole[] =
    input.variant === "customer" ? ["customer", "provider"] : [input.variant];

  const { data } = await supabase
    .from("legal_acceptances")
    .select("role, content_hash")
    .eq("user_id", input.userId)
    .eq("kind", "master_agreement")
    .eq("version", LEGAL_CONTENT_VERSION)
    .in("role", variants);

  return (data ?? []).some(
    (row) =>
      row.content_hash ===
      stableContentHash(getMasterAgreementSnapshot(row.role)),
  );
}
