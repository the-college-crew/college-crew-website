import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "../../../lib/db/types";

/**
 * E2E used to fall through to Production, which put a synthetic "approved"
 * provider on the real Browse page (commit 6bac660). Hosted Preview now has a
 * separate Supabase project, but this suite remains strictly local: it resets
 * data and should never mutate either hosted environment.
 *
 * `npm run test:e2e` redirects the suite at the local stack, but the guard
 * lived only in that runner — a bare `npx playwright test`, which is what you
 * reach for when iterating on one spec, wrote straight to production. These
 * helpers move the guard into the client itself: a service-role client that
 * refuses to exist unless it is pointed at localhost.
 */

const LOCAL_HOSTNAMES = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

export function assertLocalSupabase(rawUrl: string | undefined): string {
  if (!rawUrl) {
    throw new Error(
      "E2E: NEXT_PUBLIC_SUPABASE_URL is unset. Run the suite with `npm run test:e2e`, " +
        "which starts from `supabase status` and injects the local stack's URL and keys.",
    );
  }

  let hostname: string;
  try {
    hostname = new URL(rawUrl).hostname;
  } catch {
    throw new Error(`E2E: NEXT_PUBLIC_SUPABASE_URL is not a valid URL: ${rawUrl}`);
  }

  if (!LOCAL_HOSTNAMES.has(hostname)) {
    throw new Error(
      `E2E REFUSING TO RUN: NEXT_PUBLIC_SUPABASE_URL points at "${hostname}", not the ` +
        "local Supabase stack. This suite inserts synthetic providers, services, and " +
        "bookings with a service-role key that bypasses RLS. Hosted Preview has its own " +
        "durable fixture command; this destructive suite is local-only.\n\n" +
        "Run `npm run test:e2e` (starts the local stack's env), not `npx playwright test`.",
    );
  }

  return rawUrl;
}

/**
 * Service-role client for E2E fixtures. Throws unless it is talking to the
 * local stack — construct it at module scope so a misdirected run fails during
 * collection, before any fixture writes a row.
 */
export function createLocalAdminClient(): SupabaseClient<Database> {
  const url = assertLocalSupabase(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceRoleKey) {
    throw new Error(
      "E2E: SUPABASE_SERVICE_ROLE_KEY is unset. Run the suite with `npm run test:e2e`.",
    );
  }

  return createClient<Database>(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Delete every booking a synthetic customer owns, and its payments first.
 *
 * `booking_payments.booking_id` is ON DELETE RESTRICT (verified against
 * pg_constraint), so deleting bookings while payment rows exist raises 23503.
 * The old teardowns deleted bookings directly and discarded the error, so any
 * spec that inserted a `booking_payments` row left both tables behind.
 *
 * Booking ids are read back rather than passed in because the browser journeys
 * create bookings the spec never names.
 */
export async function deleteCustomerBookings(
  admin: SupabaseClient<Database>,
  customerId: string,
): Promise<{ error: { message: string } | null }> {
  const { data, error: selectError } = await admin
    .from("bookings")
    .select("id")
    .eq("customer_id", customerId);
  if (selectError) return { error: selectError };

  const bookingIds = (data ?? []).map((row) => row.id);
  if (bookingIds.length > 0) {
    const { error: paymentsError } = await admin
      .from("booking_payments")
      .delete()
      .in("booking_id", bookingIds);
    if (paymentsError) return { error: paymentsError };
  }

  return admin.from("bookings").delete().eq("customer_id", customerId);
}

type TeardownStep = {
  label: string;
  run: () => PromiseLike<{ error: { message: string } | null }>;
};

/**
 * Run every teardown step even if an earlier one fails, then throw if any of
 * them did. The previous teardowns discarded the delete errors, so a cleanup
 * blocked by a foreign key finished silently and looked like success — the
 * failure mode that leaves orphaned rows behind in a hosted project.
 */
export async function runTeardown(steps: TeardownStep[]): Promise<void> {
  const failures: string[] = [];

  for (const step of steps) {
    try {
      const { error } = await step.run();
      if (error) failures.push(`${step.label}: ${error.message}`);
    } catch (cause) {
      failures.push(`${step.label}: ${(cause as Error).message}`);
    }
  }

  if (failures.length > 0) {
    throw new Error(
      `E2E teardown left synthetic rows behind:\n  ${failures.join("\n  ")}\n\n` +
        "Sweep them before running again — see docs/SHARED_DB_SAFETY.md.",
    );
  }
}
