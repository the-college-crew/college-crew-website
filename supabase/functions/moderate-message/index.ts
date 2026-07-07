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
// Layer 2: OpenAI MODEL BACKSTOP — PLUGGABLE, deliberately deferred.
//
// This is the open gap for looping in an OpenAI model that reads each message
// and catches contact-info exchange the regexes miss ("find me on insta",
// "venmo same name", "five five five…", handwaved handles). Everything is
// wired except the API call: set OPENAI_API_KEY on the function
// (`npx supabase secrets set OPENAI_API_KEY=...`) and fill in the fetch below.
//
// The prompt MUST encode the policy nuance from the top of this file: the
// customer's ADDRESS and job logistics are legitimate and must pass; only
// off-platform CONTACT CHANNELS (phone, email, social, payment apps) are
// targets. Return null to pass the message through unchanged, or
// { cleaned, matched } to redact spans / flag for founder review.
//
// Deferred per SPEC §7: final policy tuning + the founder review dashboard.
// ─────────────────────────────────────────────────────────────────────────
const MODERATION_POLICY = `You review one chat message between a customer and a student service provider on a home-services marketplace. Your ONLY job is to catch attempts to move the relationship off-platform by sharing a private CONTACT CHANNEL: phone numbers (including spelled-out or obfuscated), personal emails, social handles/usernames, or payment apps (Venmo, Cash App, Zelle, PayPal, Apple Pay). The customer's street ADDRESS and any job logistics (times, tasks, gate codes, pricing) are legitimate — never flag those. Reply with the message rewritten so each offending span is replaced by "${"[hidden — keep it on College Crew]"}", plus the list of what you caught.`;

async function modelModerationPass(
  body: string,
): Promise<{ cleaned: string; matched: string[] } | null> {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) return null; // Not wired yet — regex layer stands alone.

  // TODO(openai): call the OpenAI API with MODERATION_POLICY as the system
  // prompt and `body` as the user message, parse the structured response into
  // { cleaned, matched }, and return it. Fail open (return null) on any error
  // or timeout so a model outage never blocks a legitimate message.
  void MODERATION_POLICY;
  return null;
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

    // Moderation: regex layer, then the (pluggable) model backstop.
    let { cleaned, matched } = regexModerationPass(text);
    const modelResult = await modelModerationPass(cleaned);
    if (modelResult) {
      cleaned = modelResult.cleaned;
      matched = [...matched, ...modelResult.matched];
    }

    const { data: message, error: insertError } = await admin
      .from("messages")
      .insert({
        conversation_id,
        sender_id: user.id,
        body: cleaned,
        image_path: image,
        moderation_status: matched.length > 0 ? "redacted" : "clean",
      })
      .select("*")
      .single();
    if (insertError || !message) {
      return json({ error: "Could not send the message." }, 500);
    }

    // Log the original for founder review (admin-only table).
    if (matched.length > 0) {
      await admin.from("moderation_events").insert({
        message_id: message.id,
        original_body: text,
        matched_patterns: matched,
      });
    }

    return json({ message });
  } catch (cause) {
    console.error("moderate-message failed:", cause);
    return json({ error: "Unexpected moderation error." }, 500);
  }
});
