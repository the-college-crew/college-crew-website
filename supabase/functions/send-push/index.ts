// send-push — internal push fan-out. NOT client-callable.
//
// This is called by trusted server-side callers only (a Supabase DB webhook or
// another Edge Function), so verify_jwt is OFF and auth is a constant-time
// compare of the `x-send-push-secret` header against the SEND_PUSH_SECRET env.
// With no secret set the function refuses every request (503) rather than
// running open. It loads the target user's registered Expo push tokens and
// delivers one notification via the Expo push API, pruning any token Expo
// reports as `DeviceNotRegistered` (the stale-token cleanup deferred out of the
// mobile_push_and_ugc migration).
//
// Contract of record: packages/core/src/contracts/edge.ts (sendPush*). The wire
// shape is { userId, kind, payload }: `kind` is the notification category the
// app routes on (delivered inside `data`), and `payload` carries the display
// content — `title`/`body` are lifted from it when present, and the whole
// payload (plus `kind`) is delivered as `data` for client-side routing.
//
// verify_jwt=false (set at deploy). Secrets: SUPABASE_SERVICE_ROLE_KEY
// (push_tokens read/prune), SEND_PUSH_SECRET (the shared caller secret).
//
// Deploy: npx supabase functions deploy send-push --no-verify-jwt

import { createClient } from "npm:@supabase/supabase-js@2";
import { createHash, timingSafeEqual } from "node:crypto";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const EXPO_BATCH = 100; // Expo accepts up to 100 messages per request.
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const json = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const fail = (code: string, message: string, status: number) =>
  json({ error: { code, message } }, status);

/** Constant-time secret compare. Hash both sides to fixed-length digests first
 * so timingSafeEqual never sees unequal lengths (and length isn't leaked). */
function secretMatches(provided: string, expected: string): boolean {
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

type ExpoTicket =
  | { status: "ok"; id?: string }
  | { status: "error"; message?: string; details?: { error?: string } };

type PushMessage = {
  to: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  sound: "default";
};

/** Deliver one batch and return the tickets aligned to the input order. Never
 * throws — a transport failure yields no tickets (nothing pruned, nothing
 * retried here; the caller's webhook owns retries). */
async function deliverBatch(messages: PushMessage[]): Promise<ExpoTicket[]> {
  try {
    const res = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(messages),
    });
    if (!res.ok) {
      console.error("expo push non-ok:", res.status, await res.text().catch(() => ""));
      return [];
    }
    const parsed = await res.json();
    return Array.isArray(parsed?.data) ? (parsed.data as ExpoTicket[]) : [];
  } catch (cause) {
    console.error("expo push failed:", cause);
    return [];
  }
}

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return fail("method_not_allowed", "Use POST.", 405);
  }

  try {
    const expectedSecret = Deno.env.get("SEND_PUSH_SECRET");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!expectedSecret || !serviceKey) {
      return fail("unconfigured", "Push delivery isn’t configured yet.", 503);
    }

    // Shared-secret gate — this endpoint is internal, never user-facing.
    const provided = request.headers.get("x-send-push-secret") ?? "";
    if (!provided || !secretMatches(provided, expectedSecret)) {
      return fail("forbidden", "Invalid push secret.", 401);
    }

    const body = (await request.json().catch(() => null)) as {
      userId?: unknown;
      kind?: unknown;
      payload?: unknown;
    } | null;
    const userId = typeof body?.userId === "string" ? body.userId : "";
    const kind = typeof body?.kind === "string" ? body.kind.trim() : "";
    const payload =
      body?.payload && typeof body.payload === "object" && !Array.isArray(body.payload)
        ? (body.payload as Record<string, unknown>)
        : null;
    if (!UUID_RE.test(userId) || kind.length < 1 || kind.length > 60 || !payload) {
      return fail("bad_request", "Expected { userId, kind, payload }.", 400);
    }

    const admin = createClient<any>(Deno.env.get("SUPABASE_URL")!, serviceKey);

    const { data: tokens } = await admin
      .from("push_tokens")
      .select("expo_token")
      .eq("user_id", userId);
    const recipients = ((tokens ?? []) as Array<{ expo_token: string }>).map(
      (t) => t.expo_token,
    );
    // No registered devices is a success — there's simply nothing to deliver.
    if (recipients.length === 0) return json({ ok: true });

    // Display content comes from the payload; the full payload (plus kind) rides
    // along as `data` so the app can route the tap. title falls back to a
    // neutral brand string; body is optional.
    const title =
      typeof payload.title === "string" && payload.title.trim()
        ? payload.title
        : "College Crew";
    const messageBody = typeof payload.body === "string" ? payload.body : "";
    const data = { ...payload, kind };

    const staleTokens = new Set<string>();
    for (let i = 0; i < recipients.length; i += EXPO_BATCH) {
      const batch = recipients.slice(i, i + EXPO_BATCH);
      const messages: PushMessage[] = batch.map((to) => ({
        to,
        title,
        body: messageBody,
        data,
        sound: "default",
      }));
      const tickets = await deliverBatch(messages);
      // Tickets are returned in the same order as the messages sent.
      tickets.forEach((ticket, idx) => {
        if (
          ticket.status === "error" &&
          ticket.details?.error === "DeviceNotRegistered"
        ) {
          staleTokens.add(batch[idx]);
        }
      });
    }

    // Prune tokens Expo says are dead so we stop paying to notify them (the
    // deferred stale-token cleanup). Best-effort — never fails the request.
    if (staleTokens.size > 0) {
      const { error } = await admin
        .from("push_tokens")
        .delete()
        .in("expo_token", [...staleTokens]);
      if (error) console.error("stale push-token prune failed:", error.message);
    }

    return json({ ok: true });
  } catch (cause) {
    console.error("send-push failed:", cause);
    return fail("internal", "Unexpected push error.", 500);
  }
});
