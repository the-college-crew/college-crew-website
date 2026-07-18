import { cache } from "react";

import { hasSupabaseEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

/**
 * Site-copy overrides (mini-CMS). The site_content table holds ONLY the text
 * an admin has edited inline; everything else falls back to the defaults
 * hardcoded in the pages. An empty map (no env, no rows) means "all defaults",
 * so pages render fine on a keyless skeleton build.
 */
export const getContentMap = cache(
  async (): Promise<ReadonlyMap<string, string>> => {
    if (!hasSupabaseEnv()) return new Map();
    const supabase = await createClient();
    const { data } = await supabase.from("site_content").select("key, value");
    return new Map((data ?? []).map((row) => [row.key, row.value]));
  },
);

/** Override-or-default for prop positions where JSX <Editable> can't go. */
export async function resolveContent(
  key: string,
  fallback: string,
): Promise<string> {
  const map = await getContentMap();
  return map.get(key) ?? fallback;
}
