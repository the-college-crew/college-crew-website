"use server";

import { redirect } from "next/navigation";

import { getOwnProviderProfile, getSession } from "@/lib/auth/session";
import type { Json } from "@/lib/db/types";
import {
  legalDocumentRole,
  legalDocumentVersion,
  requestAuditFields,
  safeNextPath,
  stableContentHash,
} from "@/lib/legal/acceptance";
import {
  getLegalDocumentSnapshot,
  type LegalDocumentKind,
} from "@/lib/legal/waivers";
import { createClient } from "@/lib/supabase/server";

export type LegalDocumentState = { error?: string };

const DOCUMENT_KINDS = new Set<LegalDocumentKind>([
  "platform_terms",
  "customer_booking_terms",
  "provider_terms",
]);

export async function acceptLegalDocument(
  _previous: LegalDocumentState,
  formData: FormData,
): Promise<LegalDocumentState> {
  const session = await getSession();
  if (!session) return { error: "Log in before accepting these terms." };
  if (session.profile.role === "admin") redirect("/admin");
  if (formData.get("acceptLegalDocument") !== "on") {
    return { error: "Check the box to accept these terms." };
  }

  const rawKind = formData.get("kind");
  if (typeof rawKind !== "string" || !DOCUMENT_KINDS.has(rawKind as LegalDocumentKind)) {
    return { error: "These terms are no longer available. Reload the page." };
  }
  const kind = rawKind as LegalDocumentKind;
  if (kind === "provider_terms" && !(await getOwnProviderProfile())) {
    return { error: "Start provider onboarding before accepting provider terms." };
  }

  const signerName = session.profile.full_name.trim();
  if (!signerName) {
    return { error: "Add your name to your profile before accepting." };
  }

  const snapshot = getLegalDocumentSnapshot(kind);
  const expectedHash = stableContentHash(snapshot);
  if (formData.get("renderedHash") !== expectedHash) {
    return {
      error:
        "The terms changed while this page was open. Reload and review the current version.",
    };
  }

  const supabase = await createClient();
  const audit = await requestAuditFields();
  const { error } = await supabase.from("legal_acceptances").insert({
    user_id: session.user.id,
    kind,
    role: legalDocumentRole(kind),
    version: legalDocumentVersion(kind),
    content_hash: expectedHash,
    signer_name: signerName,
    snapshot: snapshot as Json,
    ...audit,
  });
  if (error && error.code !== "23505") {
    return { error: "Could not save your acceptance. Try again." };
  }

  redirect(safeNextPath(formData.get("next")));
}
