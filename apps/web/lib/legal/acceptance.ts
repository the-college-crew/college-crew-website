import "server-only";

import { createHash } from "node:crypto";

import { headers } from "next/headers";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, UserRole } from "@/lib/db/types";
import {
  CUSTOMER_BOOKING_TERMS_VERSION,
  getLegalDocumentSnapshot,
  getMasterAgreementSnapshot,
  type LegalDocumentKind,
  LEGAL_CONTENT_VERSION,
  PLATFORM_TERMS_VERSION,
  PROVIDER_TERMS_VERSION,
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
  if (
    value === "/legal/master" ||
    value.startsWith("/legal/master?") ||
    value === "/legal/customer-booking" ||
    value.startsWith("/legal/customer-booking?") ||
    value === "/legal/provider" ||
    value.startsWith("/legal/provider?")
  ) {
    return "/";
  }
  return value;
}

export function legalDocumentPath(kind: LegalDocumentKind, next?: string) {
  const safeNext = safeNextPath(next);
  const pathname =
    kind === "platform_terms"
      ? "/legal/master"
      : kind === "customer_booking_terms"
        ? "/legal/customer-booking"
        : "/legal/provider";
  return `${pathname}?next=${encodeURIComponent(safeNext)}`;
}

export function legalDocumentVersion(kind: LegalDocumentKind) {
  if (kind === "platform_terms") return PLATFORM_TERMS_VERSION;
  if (kind === "customer_booking_terms") {
    return CUSTOMER_BOOKING_TERMS_VERSION;
  }
  return PROVIDER_TERMS_VERSION;
}

export function legalDocumentRole(kind: LegalDocumentKind): UserRole {
  return kind === "provider_terms" ? "provider" : "customer";
}

export type LegalAcceptanceEvidence = {
  kind: string;
  role: UserRole;
  version: string;
  content_hash: string;
};

export function acceptanceSatisfiesLegalDocument(
  row: LegalAcceptanceEvidence,
  kind: LegalDocumentKind,
) {
  if (
    row.kind === kind &&
    row.version === legalDocumentVersion(kind) &&
    row.content_hash === stableContentHash(getLegalDocumentSnapshot(kind))
  ) {
    return true;
  }
  if (row.kind !== "master_agreement" || row.version !== LEGAL_CONTENT_VERSION) {
    return false;
  }
  if (row.role === "provider") {
    return (
      row.content_hash === stableContentHash(getMasterAgreementSnapshot("provider"))
    );
  }
  return (
    kind !== "provider_terms" &&
    row.role === "customer" &&
    row.content_hash === stableContentHash(getMasterAgreementSnapshot("customer"))
  );
}

/**
 * Exact modular acceptance check with immutable legacy compatibility. No old
 * row is rewritten: the published customer superset satisfies platform and
 * customer terms; the provider superset also satisfies provider terms.
 */
export async function hasAcceptedCurrentLegalDocument(
  supabase: SupabaseClient<Database>,
  input: { userId: string; kind: LegalDocumentKind },
) {
  const { data } = await supabase
    .from("legal_acceptances")
    .select("kind, role, version, content_hash")
    .eq("user_id", input.userId)
    .in("kind", [input.kind, "master_agreement"]);

  return (data ?? []).some((row) =>
    acceptanceSatisfiesLegalDocument(row, input.kind),
  );
}
