/** Private bucket holding each provider's driver's-license photos. */
export const ID_DOCUMENTS_BUCKET = "id-documents";

/**
 * Per-file ceiling. The bytes go browser -> Supabase Storage directly, so this
 * is a real product limit rather than a workaround: a Server Action upload
 * would additionally hit the host's ~4.5 MB request-body cap long before this.
 */
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

export type LicenseSide = "front" | "back";

export const LICENSE_SIDES: readonly LicenseSide[] = ["front", "back"];

export const LICENSE_SIDE_LABEL: Record<LicenseSide, string> = {
  front: "front",
  back: "back (barcode side)",
};

/** What the file inputs accept, mirrored by validateLicenseFile below. */
export const ID_DOCUMENT_ACCEPT = "image/*,application/pdf";

/** Validate one license file before it leaves the browser; null when it passes. */
export function validateLicenseFile(
  file: File,
  side: LicenseSide,
): string | null {
  if (file.size > MAX_DOCUMENT_BYTES) {
    return `The ${LICENSE_SIDE_LABEL[side]} image is over 10 MB - use a smaller photo.`;
  }
  if (!file.type.startsWith("image/") && file.type !== "application/pdf") {
    return `Upload a photo or PDF for the ${LICENSE_SIDE_LABEL[side]} of your license.`;
  }
  return null;
}

/**
 * Storage keys are chosen in the browser now, so the extension is derived from
 * untrusted input: keep it to a short alphanumeric token and fall back to the
 * MIME type. isOwnIdDocumentPath re-checks the whole shape server-side.
 */
function safeExtension(file: File): string {
  const candidate = file.name.split(".").pop()?.toLowerCase() ?? "";
  const cleaned = candidate.replace(/[^a-z0-9]/g, "").slice(0, 5);
  if (cleaned) return cleaned;
  return file.type === "application/pdf" ? "pdf" : "jpg";
}

/** Object key for one side. The user-id folder is what storage RLS scopes on. */
export function idDocumentPath(
  userId: string,
  side: LicenseSide,
  file: File,
): string {
  return `${userId}/license-${side}-${Date.now()}.${safeExtension(file)}`;
}

/**
 * Server-side guard: the client tells us which key it uploaded, so confirm the
 * key is one this user could have written. Storage RLS already blocks writes
 * outside `${userId}/`, so this mainly rejects paths pointing at nothing.
 */
export function isOwnIdDocumentPath(
  path: string,
  userId: string,
  side: LicenseSide,
): boolean {
  const prefix = `${userId}/`;
  if (!userId || !path.startsWith(prefix)) return false;
  const pattern = new RegExp(`^license-${side}-\\d+\\.[a-z0-9]{1,5}$`);
  return pattern.test(path.slice(prefix.length));
}
