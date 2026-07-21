import "server-only";

import { hasServiceRoleEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Confirm a client-supplied storage key actually points at an uploaded object.
 *
 * Browser-direct uploads mean the Server Action receives a path string instead
 * of the bytes, so before writing that string to a column we check the object
 * landed. Callers must ALSO check the path belongs to the caller (the per-bucket
 * `isOwn…Path` helpers) - this only answers "does it exist".
 *
 * Service role, because the private buckets aren't readable by the anon role
 * and a listing is cheaper than a signed-URL round trip.
 */
export async function uploadedObjectExists(
  bucket: string,
  path: string,
): Promise<boolean> {
  // Local envs without a service-role key fall back to trusting the path shape.
  if (!hasServiceRoleEnv()) return true;

  const separator = path.lastIndexOf("/");
  if (separator < 1) return false;
  const folder = path.slice(0, separator);
  const name = path.slice(separator + 1);

  const { data, error } = await createAdminClient()
    .storage.from(bucket)
    .list(folder, { search: name, limit: 100 });

  if (error) return false;
  return (data ?? []).some((object) => object.name === name);
}
