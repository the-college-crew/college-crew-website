// update-profile-text — the write path for a provider's public storefront text
// (display_name, bio, company_name) from mobile, with flag-only moderation.
//
// Why this is an Edge Function and not a direct client write: migration
// 20260713165821_profile_text_moderation.sql REVOKED the UPDATE grant on those
// three columns from `authenticated` (it was a moderation bypass — write the bio
// straight from the anon key, the scan never runs). So, exactly like
// moderate-message is the ONLY write path into public.messages, this is the only
// write path into those columns from an untrusted client. The web app writes
// them from a trusted Server Action and scans in after() — the mobile app has no
// such server, so the function both writes and scans.
//
// Two-layer, FLAG-ONLY scan, ported from apps/web/lib/moderation/profile-text.ts
// so web and mobile judge profile text by identical rules:
//   1. regex — profanity (leet/space/vowel-mask tolerant, word-boundary
//      anchored) + the off-platform contact patterns shared with chat.
//   2. gpt-5.4-nano backstop — obfuscation, slurs, sexual content, threats,
//      slander, and contact info the regex misses.
// Text is NEVER blocked or rewritten: it saves, it goes live, and a hit only
// logs profile_moderation_events and emails the founders (who edit/clear it in
// the admin dashboard). The scan fails open — no OPENAI_API_KEY, an error, or a
// timeout just means the model layer contributes no flags.
//
// Contract of record: packages/core/src/contracts/edge.ts (updateProfileText*).
// verify_jwt stays ON. Secrets: SUPABASE_SERVICE_ROLE_KEY (the columns and
// profile_moderation_events are service-role only), OPENAI_API_KEY (Layer 2),
// RESEND_API_KEY + EMAIL_FROM (founder email). A configured provider without
// EMAIL_FROM fails loudly instead of using a shared sender.
//
// Deploy: npx supabase functions deploy update-profile-text

import { createClient } from "npm:@supabase/supabase-js@2";

type ProfileTextField = "display_name" | "bio" | "company_name";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const json = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const fail = (code: string, message: string, status: number) =>
  json({ error: { code, message } }, status);

// ─────────────────────────────────────────────────────────────────────────
// Layer 1a: profanity. Leetspeak/spacing is normalized first so each root is
// listed once; roots match on WORD BOUNDARIES (never substrings) so "class",
// "Cockburn", "Assumption" never flag. Slurs/hate/sexual/threats/slander are
// deliberately NOT enumerated — Layer 2 judges those. (Ported verbatim from
// apps/web/lib/moderation/profile-text.ts.)
// ─────────────────────────────────────────────────────────────────────────
const PROFANITY_ROOTS = [
  "fuck", "shit", "bitch", "cunt", "asshole", "dickhead", "bastard", "whore",
  "slut", "wanker", "prick", "twat", "bollocks", "jackass", "dumbass",
  "goddamn", "motherfucker", "bullshit", "piss", "cock", "dick", "pussy",
];

const LEET: Record<string, string> = {
  "@": "a", "4": "a", "3": "e", "1": "i", "!": "i", "|": "i",
  "0": "o", $: "s", "5": "s", "7": "t",
};

/** Lowercase + de-leet, so "Sh1t" and "$HIT" both become "shit". */
function normalize(text: string): string {
  return text.toLowerCase().replace(/[@41!|305$7]/g, (char) => LEET[char] ?? char);
}

const VOWEL_MASK = "*#%@$!+.";
const VOWELS = new Set(["a", "e", "i", "o", "u"]);
const SUFFIX =
  "(?:s|es|ed|er|ers|ing|in|y|ies|head|heads|hole|holes|bag|bags|face|faced)?";

/** One root → a regex tolerant of repetition, separators, vowel masking, and an
 * allowed suffix, while staying anchored on word boundaries. A vowel matches
 * itself, a mask symbol, or nothing — never a DIFFERENT vowel (so "shit" can't
 * match "shot"). */
function rootToRegex(root: string): RegExp {
  const body = root
    .split("")
    .map((letter) =>
      VOWELS.has(letter)
        ? `(?:${letter}+|[${VOWEL_MASK.replace(/[.*+$]/g, "\\$&")}])?`
        : `${letter}+`,
    )
    .join("[\\W_]{0,2}");
  return new RegExp(`\\b${body}${SUFFIX}\\b`, "i");
}

const PROFANITY_PATTERNS = PROFANITY_ROOTS.map((root) => ({
  name: "profanity",
  regex: rootToRegex(root),
}));

// Layer 1b: off-platform contact info — shared with moderate-message so chat and
// profiles judge contact channels identically. Phones, emails, handles, and
// payment apps only (a bio has no legitimate contact channel).
const CONTACT_PATTERNS: Array<{ name: string; regex: RegExp }> = [
  { name: "phone_number", regex: /(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/ },
  {
    name: "spelled_out_number",
    regex: /(?:\b(?:zero|one|two|three|four|five|six|seven|eight|nine)\b[\s,.-]*){7,}/i,
  },
  { name: "email_address", regex: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/ },
  { name: "social_handle", regex: /(?<![\w.])@[A-Za-z0-9_.]{3,30}\b/ },
  { name: "payment_app", regex: /\b(?:venmo|cash\s?app|zelle|paypal|apple\s?pay)\b/i },
  {
    name: "social_platform",
    regex: /\b(?:insta(?:gram)?|snap(?:chat)?|whats\s?app|telegram|signal|tik\s?tok|facebook|\bfb\b)\b/i,
  },
  { name: "off_platform_contact", regex: /\b(?:text|call|dm|hmu|hit me up)\s+(?:me|us)\b/i },
];

/** Layer 1 over one field. Profanity is tested against BOTH the normalized and
 * raw text (leet resolves under normalize, vowel masks survive only in raw);
 * contact info is tested against the raw text only (de-leeting corrupts digits:
 * "555" → "sss"). */
function regexScan(text: string): string[] {
  const matched = new Set<string>();
  const normalized = normalize(text);
  const raw = text.toLowerCase();
  for (const { name, regex } of PROFANITY_PATTERNS) {
    if (regex.test(normalized) || regex.test(raw)) matched.add(name);
  }
  for (const { name, regex } of CONTACT_PATTERNS) {
    if (regex.test(text)) matched.add(name);
  }
  return [...matched];
}

// ─────────────────────────────────────────────────────────────────────────
// Layer 2: gpt-5.4-nano backstop — FLAG-ONLY and fail-open. Catches what a word
// list structurally cannot (unseen obfuscation, slurs, sexual content, threats,
// slander). Any error/timeout/missing key/malformed response → no flags.
// ─────────────────────────────────────────────────────────────────────────
const MODEL = "gpt-5.4-nano";
const MODEL_TIMEOUT_MS = 2500;

const FIELD_LABEL: Record<ProfileTextField, string> = {
  display_name: "public display name",
  bio: "public profile bio",
  company_name: "public company name",
};

const SCAN_POLICY = `You review the ${"{field}"} that a student service provider wrote for their public profile on a home-services marketplace. Neighbors read it when deciding who to hire. Decide whether it contains any of: profanity or vulgar language (including obfuscated spellings); slurs, hate speech, or harassment; sexual content; threats or glorified violence; illegal-activity solicitation; slander — an attack on, or a damaging accusation against, a named person, competitor, or business; or off-platform CONTACT CHANNELS, meaning a phone number (including spelled-out or obfuscated), a personal email, a social handle or platform, or a payment app (Venmo, Cash App, Zelle, PayPal, Apple Pay). Ordinary, professional self-description is fine and must not be flagged: naming their school, their major, their hometown, their work experience, the services they offer, or their general neighborhood is all legitimate. Mild enthusiasm, humor, and casual tone are fine. Report whether the text contains anything in the list above, and which categories apply. Do not rewrite anything.`;

const RESPONSE_FORMAT = {
  type: "json_schema",
  json_schema: {
    name: "profile_text_scan",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        violation_detected: { type: "boolean" },
        categories: {
          type: "array",
          items: {
            type: "string",
            enum: [
              "profanity",
              "hate_or_slur",
              "sexual_content",
              "violence_or_threat",
              "illegal_activity",
              "slander",
              "contact_info",
              "other_inappropriate",
            ],
          },
        },
      },
      required: ["violation_detected", "categories"],
    },
  },
};

/** Flagged categories (prefixed `model:`), or [] — never throws. */
async function modelScan(field: ProfileTextField, text: string): Promise<string[]> {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey || !text.trim()) return [];

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
          { role: "system", content: SCAN_POLICY.replace("{field}", FIELD_LABEL[field]) },
          { role: "user", content: text },
        ],
        response_format: RESPONSE_FORMAT,
      }),
    });
    if (!res.ok) {
      console.error("profile moderation non-ok:", res.status);
      return [];
    }
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== "string") return [];
    const parsed = JSON.parse(content) as {
      violation_detected?: boolean;
      categories?: unknown;
    };
    if (!parsed.violation_detected) return [];
    const categories = Array.isArray(parsed.categories)
      ? parsed.categories.filter((c): c is string => typeof c === "string")
      : [];
    const matched = categories.length > 0 ? categories : ["other_inappropriate"];
    return matched.map((category) => `model:${category}`);
  } catch (cause) {
    console.error("profile moderation failed (failing open):", cause);
    return [];
  } finally {
    clearTimeout(timer);
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Founder notification — mirrors sendProfileFlagEmail (apps/web/lib/email/send.ts).
// Edge functions can't import that file, so this hits the Resend REST API and
// mirrors its stub behavior. Never throws — a notification failure must not
// affect the save.
// ─────────────────────────────────────────────────────────────────────────
const NOTIFY_TO = ["Ari@thecollegecrew.com", "zach@thecollegecrew.com"];
const EMAIL_LABEL: Record<ProfileTextField, string> = {
  display_name: "display name",
  bio: "bio",
  company_name: "company name",
};

async function sendProfileFlagEmail(opts: {
  field: ProfileTextField;
  matched: string[];
  text: string;
  userId: string;
}, admin: ReturnType<typeof createClient<any>>): Promise<void> {
  const label = EMAIL_LABEL[opts.field];
  const apiKey = Deno.env.get("RESEND_API_KEY");
  const subject = `College Crew: a provider ${label} was flagged`;
  const text = [
    `A provider's ${label} tripped the profile scan. It is LIVE on their public profile — flagging does not block it.`,
    "",
    `What matched: ${opts.matched.join(", ")}`,
    `Provider (user id): ${opts.userId}`,
    "",
    `Flagged ${label}:`,
    opts.text,
    "",
    "Review it in the admin dashboard → Flagged, under 'Flagged profiles'. You can edit or clear the text there.",
  ].join("\n");

  if (!apiKey) {
    console.info(`[email:stub] profile flag (${label}) — ${opts.matched.join(", ")}`);
    return;
  }
  const from = Deno.env.get("EMAIL_FROM")?.trim();
  if (!from) {
    console.error("profile flag notification configuration error: EMAIL_FROM is missing");
    return;
  }
  const recipients: string[] = [];
  for (const recipient of NOTIFY_TO) {
    const suppression = await admin.rpc("get_active_email_suppression", {
      p_recipient_email: recipient,
    });
    if (suppression.error) {
      console.error("profile flag notification suppression check failed");
      return;
    }
    if (!suppression.data?.length) recipients.push(recipient);
  }
  if (!recipients.length) {
    console.error("profile flag notification skipped: all recipients are suppressed");
    return;
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: recipients, subject, text }),
    });
    if (!res.ok) {
      console.error("profile flag notification non-ok:", res.status, await res.text());
    }
  } catch (cause) {
    console.error("profile flag notification failed:", cause);
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Request parsing. Mirrors updateProfileTextRequestSchema: at least one of
// displayName (1–80), bio (≤2000), companyName (≤120), each trimmed.
// ─────────────────────────────────────────────────────────────────────────
type ParsedUpdate = Partial<Record<ProfileTextField, string>>;

function parseUpdate(body: unknown): { fields: ParsedUpdate } | { error: string } {
  if (!body || typeof body !== "object") return { error: "Provide fields to update." };
  const b = body as Record<string, unknown>;
  const fields: ParsedUpdate = {};

  if (b.displayName !== undefined) {
    if (typeof b.displayName !== "string") return { error: "displayName must be text." };
    const v = b.displayName.trim();
    if (v.length < 1 || v.length > 80) return { error: "Display name must be 1–80 characters." };
    fields.display_name = v;
  }
  if (b.bio !== undefined) {
    if (typeof b.bio !== "string") return { error: "bio must be text." };
    const v = b.bio.trim();
    if (v.length > 2000) return { error: "Bio must be 2000 characters or fewer." };
    fields.bio = v;
  }
  if (b.companyName !== undefined) {
    if (typeof b.companyName !== "string") return { error: "companyName must be text." };
    const v = b.companyName.trim();
    if (v.length > 120) return { error: "Company name must be 120 characters or fewer." };
    fields.company_name = v;
  }

  if (Object.keys(fields).length === 0) return { error: "Provide at least one field to update." };
  return { fields };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return fail("method_not_allowed", "Use POST.", 405);
  }

  try {
    const authHeader = request.headers.get("Authorization");
    if (!authHeader) return fail("not_signed_in", "Not signed in.", 401);

    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!serviceKey) {
      return fail("unconfigured", "Profile updates aren’t configured yet.", 503);
    }

    const userClient = createClient<any>(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const {
      data: { user },
    } = await userClient.auth.getUser();
    if (!user) return fail("not_signed_in", "Not signed in.", 401);

    const parsed = parseUpdate(await request.json().catch(() => null));
    if ("error" in parsed) return fail("bad_request", parsed.error, 400);
    const { fields } = parsed;

    // Service role: these columns and profile_moderation_events are service-role
    // only, so this client is what makes the whole path work.
    const admin = createClient<any>(Deno.env.get("SUPABASE_URL")!, serviceKey);

    // Only a provider owns storefront text. provider_profiles.user_id has no
    // browser grant, but the service role reads it directly.
    const { data: profile } = await admin
      .from("provider_profiles")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!profile) {
      return fail("not_provider", "Only a provider profile has storefront text.", 403);
    }

    // Write first (flag-only: the text goes live regardless of the scan).
    const { error: updateError } = await admin
      .from("provider_profiles")
      .update(fields)
      .eq("user_id", user.id);
    if (updateError) {
      console.error("update-profile-text write failed:", updateError.message);
      return fail("save_failed", "Could not save your profile — try again.", 500);
    }

    // Scan every submitted field in parallel (each layer is bounded; running the
    // ≤3 fields concurrently keeps the response near a single model round-trip).
    const entries = Object.entries(fields) as Array<[ProfileTextField, string]>;
    const results = await Promise.all(
      entries.map(async ([field, text]) => {
        const trimmed = text.trim();
        if (!trimmed) return { field, text: trimmed, matched: [] as string[] };
        const matched = [...regexScan(trimmed), ...(await modelScan(field, trimmed))];
        return { field, text: trimmed, matched };
      }),
    );

    const flagged = results.filter((r) => r.matched.length > 0);
    if (flagged.length > 0) {
      // Log every flagged field for founder review, then email (after the
      // response, so notification latency never reaches the client).
      await admin.from("profile_moderation_events").insert(
        flagged.map((r) => ({
          provider_id: profile.id,
          user_id: user.id,
          field: r.field,
          flagged_text: r.text,
          matched_patterns: r.matched,
        })),
      );
      const notify = Promise.all(
        flagged.map((r) =>
          sendProfileFlagEmail(
            {
              field: r.field,
              matched: r.matched,
              text: r.text,
              userId: user.id,
            },
            admin,
          ),
        ),
      ).then(() => {});
      // @ts-ignore — EdgeRuntime is provided by the Supabase Deno runtime.
      if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(notify);
      else await notify;
    }

    return json({ ok: true, moderation: flagged.length > 0 ? "flagged" : "clean" });
  } catch (cause) {
    console.error("update-profile-text failed:", cause);
    return fail("internal", "Unexpected profile update error.", 500);
  }
});
