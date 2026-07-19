import { createClient } from "npm:@supabase/supabase-js@2";

// deno-lint-ignore no-explicit-any — the generated Database types live in
// apps/web/lib/db/types.ts and aren't importable here until packages/db is
// extracted; row/RPC shapes are typed locally at each call site instead.
export type AdminClient = ReturnType<typeof createClient<any>>;

/** Service-role client — this function is trusted backend automation. */
export function createAdminClient(): AdminClient {
  return createClient<any>(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}
