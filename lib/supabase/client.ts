import { createBrowserClient } from "@supabase/ssr";

import type { Database } from "@/lib/db/types";

/**
 * Browser client (anon key). For client components only.
 * Server code uses lib/supabase/server.ts or lib/supabase/admin.ts.
 */
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
