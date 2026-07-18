import { hasSupabaseEnv } from "@/lib/env";

/**
 * Development-only notice shown while .env.local is missing. The whole
 * skeleton stays browsable — data helpers return empty results — and this
 * explains why every list is empty.
 */
export function DevBanner() {
  if (hasSupabaseEnv() || process.env.NODE_ENV === "production") return null;

  return (
    <div className="border-b border-gold-400 bg-gold-100 px-4 py-2 text-center text-xs font-medium text-gold-800">
      Supabase isn&apos;t configured. Copy .env.example to .env.local to
      enable auth and data. Pages render with empty data until then.
    </div>
  );
}
