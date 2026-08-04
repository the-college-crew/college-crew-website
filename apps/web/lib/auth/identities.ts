type IdentitySummary = {
  provider?: string;
  identity_data?: Record<string, unknown> | null;
};

export type GoogleIdentityState = {
  connected: boolean;
  email: string | null;
};

/** Display-only state for the Google identity attached to a Supabase user. */
export function getGoogleIdentityState(
  identities: readonly IdentitySummary[] | null | undefined,
): GoogleIdentityState {
  const google = identities?.find((identity) => identity.provider === "google");
  if (!google) return { connected: false, email: null };

  const email = google.identity_data?.email;
  return {
    connected: true,
    email: typeof email === "string" && email.trim() ? email.trim() : null,
  };
}
