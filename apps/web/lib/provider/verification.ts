import type { ProviderProfile } from "../db/types";

type ProviderIdentityProfile = Pick<
  ProviderProfile,
  | "id_document_url"
  | "id_document_back_url"
  | "verification_bypassed"
  | "verification_status"
>;

/**
 * A founder bypass is active only while the provider remains approved. The
 * audit flag intentionally survives a later rejection, but a rejected or
 * reopened profile must not keep skipping identity requirements.
 */
export function hasActiveProviderVerificationBypass(
  profile: ProviderIdentityProfile,
) {
  return (
    profile.verification_bypassed &&
    profile.verification_status === "approved"
  );
}

/** Shared contract for every provider-side school-email / ID gate. */
export function isProviderIdentityVerificationSatisfied(
  profile: ProviderIdentityProfile,
  hasVerifiedSchoolEmail: boolean,
) {
  return (
    hasActiveProviderVerificationBypass(profile) ||
    (hasVerifiedSchoolEmail &&
      Boolean(profile.id_document_url) &&
      Boolean(profile.id_document_back_url))
  );
}
