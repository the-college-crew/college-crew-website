// moderate-message — the ONLY write path into public.messages (SPEC §7).
//
// Clients call this function to send a chat message; RLS has no insert
// policy on `messages`, so moderation cannot be bypassed client-side.
//
// Two-layer scan:
//   1. Cheap regex pass (below, working) — obvious phones, emails, handles,
//      payment apps, "text me instead".
//   2. Low-latency model backstop — PLUGGABLE, see modelModerationPass().
//
// CRITICAL POLICY NUANCE: the customer's address and job logistics are
// legitimate and must NOT be blocked. Only off-platform CONTACT CHANNELS
// (phone, email, social, payment apps) are targets. Keep every pattern —
// and eventually the model prompt — written around exactly that line.
//
// Handling: redact the offending span inline + tell the sender, AND log the
// original to moderation_events for founder review. Never hard-block the
// whole message.
//
// Deploy: npx supabase functions deploy moderate-message

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type Pattern = { name: string; regex: RegExp };

// Layer 1: regex pass. Deliberately conservative so street addresses and
// job details never match (e.g. phone requires a full 10-digit shape).
const PATTERNS: Pattern[] = [
  {
    name: "phone_number",
    regex: /(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g,
  },
  {
    // "five five five one two three four…" style evasion
    name: "spelled_out_number",
    regex:
      /(?:\b(?:zero|one|two|three|four|five|six|seven|eight|nine)\b[\s,.-]*){7,}/gi,
  },
  {
    name: "email_address",
    regex: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,
  },
  {
    name: "social_handle",
    regex: /(?<![\w.])@[A-Za-z0-9_.]{3,30}\b/g,
  },
  {
    name: "payment_app",
    regex: /\b(?:venmo|cash\s?app|zelle|paypal|apple\s?pay)\b/gi,
  },
  {
    name: "social_platform",
    regex:
      /\b(?:insta(?:gram)?|snap(?:chat)?|whats\s?app|telegram|signal|tik\s?tok|facebook|\bfb\b)\b/gi,
  },
  {
    name: "off_platform_contact",
    regex: /\b(?:text|call|dm|hmu|hit me up)\s+(?:me|us)\b/gi,
  },
];

const REDACTION = "[hidden — keep it on College Crew]";

function regexModerationPass(body: string): {
  cleaned: string;
  matched: string[];
} {
  let cleaned = body;
  const matched: string[] = [];

  for (const pattern of PATTERNS) {
    if (pattern.regex.test(cleaned)) {
      matched.push(pattern.name);
      cleaned = cleaned.replace(pattern.regex, REDACTION);
    }
    pattern.regex.lastIndex = 0;
  }

  return { cleaned, matched };
}

// ─────────────────────────────────────────────────────────────────────────
// Layer 2: OpenAI MODEL BACKSTOP — gpt-5.4-nano, FLAG-ONLY.
//
// The model reads each message (already run through the regex layer) and
// catches contact-info exchange the regexes miss ("find me on insta",
// "venmo same name", "five five five…", handwaved handles). Unlike the regex
// layer it does NOT rewrite the text — it only FLAGS: the message is delivered
// unchanged, marked `flagged`, logged to moderation_events, and the founders
// are emailed. Set OPENAI_API_KEY on the function to enable it
// (`npx supabase secrets set OPENAI_API_KEY=...`); with no key it no-ops and
// the regex layer stands alone.
//
// The prompt encodes the policy nuance from the top of this file: the
// customer's ADDRESS and job logistics are legitimate and must pass; only
// off-platform CONTACT CHANNELS (phone, email, social, payment apps) are
// targets. It IDENTIFIES categories — it never rewrites the message.
// ─────────────────────────────────────────────────────────────────────────
const MODEL = "gpt-5.4-nano";
const MODEL_TIMEOUT_MS = 2500;

const MODERATION_POLICY = `You review one chat message between a customer and a student service provider on a home-services marketplace. Your ONLY job is to detect attempts to move the relationship off-platform by sharing a private CONTACT CHANNEL: phone numbers (including spelled-out or obfuscated), personal emails, social handles/usernames, or payment apps (Venmo, Cash App, Zelle, PayPal, Apple Pay). The customer's street ADDRESS and any job logistics (times, tasks, gate codes, pricing) are legitimate — never flag those. Report whether the message contains any such off-platform contact channel and which categories apply. Do not rewrite the message.`;

// Structured output: guarantees a parseable, fixed-shape reply.
const RESPONSE_FORMAT = {
  type: "json_schema",
  json_schema: {
    name: "contact_info_scan",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        contact_info_detected: { type: "boolean" },
        categories: {
          type: "array",
          items: {
            type: "string",
            enum: [
              "phone",
              "email",
              "social_handle",
              "payment_app",
              "other_contact_channel",
            ],
          },
        },
      },
      required: ["contact_info_detected", "categories"],
    },
  },
};

// Returns the flagged categories (prefixed `model:`) or null. FLAG-ONLY: it
// never touches the message text. Fails open — any error, timeout, or malformed
// response returns null so a model outage can never block a legitimate message.
async function modelModerationPass(body: string): Promise<string[] | null> {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey || !body.trim()) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), MODEL_TIMEOUT_MS);
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: MODERATION_POLICY },
          { role: "user", content: body },
        ],
        response_format: RESPONSE_FORMAT,
      }),
    });
    if (!res.ok) {
      console.error("openai moderation non-ok:", res.status);
      return null;
    }
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== "string") return null;
    const parsed = JSON.parse(content) as {
      contact_info_detected?: boolean;
      categories?: unknown;
    };
    if (!parsed.contact_info_detected) return null;
    const categories = Array.isArray(parsed.categories)
      ? parsed.categories.filter((c): c is string => typeof c === "string")
      : [];
    // Detected but no category named — still flag it generically.
    const matched = categories.length > 0 ? categories : ["other_contact_channel"];
    return matched.map((c) => `model:${c}`);
  } catch (cause) {
    console.error("openai moderation failed (failing open):", cause);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Founder notification — emailed whenever a message is flagged/redacted.
//
// Edge functions run in Deno and cannot import the app's lib/email/send.ts, so
// this hits the Resend REST API directly. Mirrors that file's stub behavior:
// with no RESEND_API_KEY set on the function it logs instead of sending, so the
// whole path is testable before the Resend account/domain exists. Never throws
// — a notification failure must not affect message delivery.
// ─────────────────────────────────────────────────────────────────────────
const NOTIFY_TO = ["Ari@thecollegecrew.com", "zach@thecollegecrew.com"];

async function sendFlagNotification(opts: {
  messageId: string;
  senderId: string;
  matched: string[];
  original: string;
}): Promise<void> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  const from =
    Deno.env.get("EMAIL_FROM")?.trim() ||
    "College Crew <onboarding@resend.dev>";
  const subject = "College Crew: a chat message was flagged";
  const text = [
    "A chat message was flagged for possible off-platform contact info.",
    "",
    `What matched: ${opts.matched.join(", ")}`,
    `Sender (user id): ${opts.senderId}`,
    `Message id: ${opts.messageId}`,
    "",
    "Original message:",
    opts.original,
    "",
    "Review it in the admin dashboard → Flagged messages.",
  ].join("\n");

  if (!apiKey) {
    console.info(
      `[email:stub] flag notification to ${NOTIFY_TO.join(", ")} — ${opts.matched.join(", ")}`,
    );
    return;
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to: NOTIFY_TO, subject, text }),
    });
    if (!res.ok) {
      console.error("flag notification non-ok:", res.status, await res.text());
    }
  } catch (cause) {
    console.error("flag notification failed:", cause);
  }
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const json = (payload: unknown, status = 200) =>
    new Response(JSON.stringify(payload), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const authHeader = request.headers.get("Authorization");
    if (!authHeader) return json({ error: "Not signed in." }, 401);

    // Identify the caller from their JWT.
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const {
      data: { user },
    } = await userClient.auth.getUser();
    if (!user) return json({ error: "Not signed in." }, 401);

    const { conversation_id, body, image_path } = await request.json();
    const text = typeof body === "string" ? body.trim().slice(0, 4000) : "";
    const image = typeof image_path === "string" ? image_path : null;
    if (!conversation_id || (!text && !image)) {
      return json({ error: "Nothing to send." }, 400);
    }

    // Service role: verify membership, then insert (the only write path).
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: conversation } = await admin
      .from("conversations")
      .select("id, customer_id, provider:provider_profiles(user_id)")
      .eq("id", conversation_id)
      .maybeSingle();
    const isMember =
      conversation &&
      (conversation.customer_id === user.id ||
        conversation.provider?.user_id === user.id);
    if (!isMember) {
      return json({ error: "Conversation not found." }, 404);
    }

    // Moderation. Layer 1 (regex) REDACTS spans inline and delivers. Layer 2
    // (gpt-5.4-nano) only FLAGS what regex missed — the text is delivered
    // unchanged. Status is `redacted` if regex rewrote the body, else `flagged`
    // if the model caught something, else `clean`.
    const { cleaned, matched: regexMatched } = regexModerationPass(text);
    const modelMatched = (await modelModerationPass(cleaned)) ?? [];
    const matched = [...regexMatched, ...modelMatched];
    const moderationStatus =
      regexMatched.length > 0
        ? "redacted"
        : modelMatched.length > 0
          ? "flagged"
          : "clean";

    const { data: message, error: insertError } = await admin
      .from("messages")
      .insert({
        conversation_id,
        sender_id: user.id,
        body: cleaned,
        image_path: image,
        moderation_status: moderationStatus,
      })
      .select("*")
      .single();
    if (insertError || !message) {
      return json({ error: "Could not send the message." }, 500);
    }

    // Log the original for founder review, then email the founders. The email
    // runs after the response (waitUntil) so it never adds send latency; it
    // also never throws, so it can't affect delivery.
    if (matched.length > 0) {
      await admin.from("moderation_events").insert({
        message_id: message.id,
        original_body: text,
        matched_patterns: matched,
      });
      const notify = sendFlagNotification({
        messageId: message.id,
        senderId: user.id,
        matched,
        original: text,
      });
      // @ts-ignore — EdgeRuntime is provided by the Supabase Deno runtime.
      if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(notify);
      else await notify;
    }

    return json({ message });
  } catch (cause) {
    console.error("moderate-message failed:", cause);
    return json({ error: "Unexpected moderation error." }, 500);
  }
});
