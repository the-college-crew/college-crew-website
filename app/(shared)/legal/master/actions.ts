"use server";

import { redirect } from "next/navigation";

import { getSession, isProviderCapable } from "@/lib/auth/session";
import type { Json } from "@/lib/db/types";
import {
  requestAuditFields,
  requiredMasterVariant,
  safeNextPath,
  stableContentHash,
} from "@/lib/legal/acceptance";
import {
  getMasterAgreementSnapshot,
  LEGAL_CONTENT_VERSION,
} from "@/lib/legal/waivers";
import { createClient } from "@/lib/supabase/server";

export type MasterAgreementState = { error?: string };

export async function acceptMasterAgreement(
  _prev: MasterAgreementState,
  formData: FormData,
): Promise<MasterAgreementState> {
  const session = await getSession();
  if (!session) {
    return { error: "Log in before accepting the agreement." };
  }

  if (formData.get("acceptMaster") !== "on") {
    return { error: "Check the box to accept the master agreement." };
  }

  const signerName = session.profile.full_name.trim();
  if (!signerName) {
    return { error: "Add your name to your profile before accepting." };
  }

  const next = safeNextPath(formData.get("next"));

  // The acceptance must attest to exactly what the page rendered. The form
  // carries the rendered variant + content hash; we recompute the required
  // variant and the hash server-side and refuse on any mismatch — a capability
  // change in another tab (customer page open, provider onboarding started)
  // or a content deploy mid-read must never record terms the user didn't see.
  const variant = requiredMasterVariant(
    session.profile.role,
    await isProviderCapable(),
  );
  const snapshot = getMasterAgreementSnapshot(variant);
  const staleAgreement: MasterAgreementState = {
    error:
      "The agreement shown here is no longer the one you need to accept. Reload the page to review the current version.",
  };
  if (formData.get("renderedVariant") !== variant) return staleAgreement;
  if (formData.get("renderedHash") !== stableContentHash(snapshot)) {
    return staleAgreement;
  }

  const audit = await requestAuditFields();
  const supabase = await createClient();

  const { error } = await supabase.from("legal_acceptances").insert({
    user_id: session.user.id,
    kind: "master_agreement",
    role: variant,
    version: LEGAL_CONTENT_VERSION,
    content_hash: stableContentHash(snapshot),
    signer_name: signerName,
    snapshot: snapshot as Json,
    ...audit,
  });

  if (error && error.code !== "23505") {
    return { error: "Could not save your acceptance. Try again." };
  }

  redirect(next);
}
