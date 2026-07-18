import { EmptyState } from "@/components/ui";

/**
 * Reachable only when the account owns a provider_profiles row (the tab is
 * hidden otherwise; see (tabs)/_layout.tsx). Dashboard + jobs land with P-7.
 */
export default function Provider() {
  return (
    <EmptyState
      title="Provider dashboard"
      body="Your requests, jobs, and earnings will live here in the next build."
    />
  );
}
