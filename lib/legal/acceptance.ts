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

export async function hasAcceptedCurrentMasterAgreement(
  supabase: SupabaseClient<Database>,
  input: { userId: string; role: UserRole },
) {
  const snapshot = getMasterAgreementSnapshot(input.role);
  const { data } = await supabase
    .from("legal_acceptances")
    .select("id")
    .eq("user_id", input.userId)
    .eq("kind", "master_agreement")
    .eq("role", input.role)
    .eq("version", LEGAL_CONTENT_VERSION)
    .eq("content_hash", stableContentHash(snapshot))
    .maybeSingle();

  return Boolean(data);
}
