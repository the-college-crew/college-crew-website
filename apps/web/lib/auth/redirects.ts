import type { Profile } from "@/lib/db/types";

const SAFE_ORIGIN = "https://college-crew.invalid";

/** Accept app-relative destinations only, including their query and hash. */
export function safeNext(next: string | null | undefined): string {
  if (!next?.startsWith("/") || next.startsWith("//")) return "/";

  try {
    const parsed = new URL(next, SAFE_ORIGIN);
    if (parsed.origin !== SAFE_ORIGIN) return "/";
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return "/";
  }
}

type RequiredProfileFields = Pick<
  Profile,
  "full_name" | "address_line1" | "city" | "state" | "postal_code"
>;

/** OAuth providers do not supply the address College Crew requires. */
export function needsProfileCompletion(profile: RequiredProfileFields): boolean {
  return [
    profile.full_name,
    profile.address_line1,
    profile.city,
    profile.state,
    profile.postal_code,
  ].some((value) => !value.trim());
}

export function profileCompletionPath(next: string): string {
  const destination = safeNext(next);
  return `/complete-profile?next=${encodeURIComponent(destination)}`;
}
