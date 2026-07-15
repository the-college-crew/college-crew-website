import "server-only";

import type { ProfileTextField } from "@/lib/db/types";
import { sendProfileFlagEmail } from "@/lib/email/send";
import { hasOpenAiEnv, hasServiceRoleEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Profile-text moderation — the public storefront counterpart to chat's
 * moderate-message Edge Function (supabase/functions/moderate-message/index.ts).
 *
 * Scans a provider's bio and display name for inappropriate content, slander,
 * and off-platform contact info, using the same two layers as chat:
 *   1. Cheap regex pass — obvious profanity plus the contact-info patterns from
 *      moderate-message.
 *   2. gpt-5.4-nano backstop — obfuscation the regex misses, plus the judgment
 *      calls a word list can't make (slurs, sexual content, threats, slander).
 *
 * FLAG-ONLY, like chat: the text is NEVER blocked, redacted, or rewritten. It
 * saves, it goes live, and we log it to profile_moderation_events and email the
 * founders, who review it on /admin/flagged and edit or clear it there.
 *
 * Because nothing depends on the result, callers run this via `after()` — the
 * provider's save returns immediately and the scan happens post-response.
 *
 * Why this lives in the app and not an Edge Function: chat's write path had to
 * BE the function (the browser inserts messages, so RLS blocks it and forces the
 * call through moderation). A bio is written by a Server Action — trusted server
 * code — so the scan just runs inline. What makes it unbypassable is the
 * revoked column grant in 20260713120000_profile_text_moderation.sql: the
 * browser can no longer write bio/display_name directly, so no edit can dodge
 * the scan.
 *
 * server-only: the OpenAI key must never reach a browser bundle.
 */

// ─────────────────────────────────────────────────────────────────────────
// Layer 1a: profanity.
//
// Leetspeak and spacing are normalized first (see normalize), so each root only
// has to be listed once — "sh1t", "$hit", and "s h i t" all arrive here as
// "shit". Each root then matches with letters optionally repeated ("fuuuck")
// and optionally separated ("f.u.c.k").
//
// Roots are matched on WORD BOUNDARIES, never as substrings. That is the whole
// defense against the Scunthorpe problem: "class", "Assumption", "Dickinson",
// and "Cockburn" must not flag a provider's bio, and a substring match would
// flag every one of them.
//
// This list is deliberately just profanity. Slurs, hate speech, sexual content,
// threats, and slander are NOT enumerated here — a static word list is both
// leaky and impossible to keep current on those, and encoding a slur list in a
// public repo has an obvious cost. Layer 2 judges all of them instead, which is
// what a model is actually good at.
// ─────────────────────────────────────────────────────────────────────────
const PROFANITY_ROOTS = [
  "fuck",
  "shit",
  "bitch",
  "cunt",
  "asshole",
  "dickhead",
  "bastard",
  "whore",
  "slut",
  "wanker",
  "prick",
  "twat",
  "bollocks",
  "jackass",
  "dumbass",
  "goddamn",
  "motherfucker",
  "bullshit",
  "piss",
  "cock",
  "dick",
  "pussy",
];

// Leet substitutions, applied before matching so the word list stays readable.
const LEET: Record<string, string> = {
  "@": "a",
  "4": "a",
  "3": "e",
  "1": "i",
  "!": "i",
  "|": "i",
  "0": "o",
  $: "s",
  "5": "s",
  "7": "t",
};

/** Lowercase + de-leet, so "Sh1t" and "$HIT" both become "shit". */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[@41!|305$7]/g, (char) => LEET[char] ?? char);
}

// Symbols people use to mask a vowel: "f*ck", "sh#t", "cr@p".
const VOWEL_MASK = "*#%@$!+.";
const VOWELS = new Set(["a", "e", "i", "o", "u"]);

// Inflections a root may carry: "fucking", "bitches", "pissed", "dickhead".
// A whitelist, NOT a free-for-all — dropping the trailing word boundary instead
// would match "cock" inside "cocktail" and "Cockburn", which is the exact class
// of false positive the boundaries exist to prevent. Doubled consonants
// ("shitty", "slutty") already fall out of the per-letter `+` repetition.
const SUFFIX =
  "(?:s|es|ed|er|ers|ing|in|y|ies|head|heads|hole|holes|bag|bags|face|faced)?";

/**
 * One root → a regex tolerant of the evasions a plain word list misses, while
 * staying anchored on word boundaries:
 *
 *   repetition    fuuuck      → each letter is `+`
 *   separators    f.u.c.k     → `[\W_]{0,2}` between letters
 *   vowel masking f*ck, fck   → each vowel may be a mask symbol, or omitted
 *   inflection    fucking     → an allowed suffix before the closing boundary
 *
 * The vowel rule is deliberately narrow: a vowel matches ITSELF, a mask symbol,
 * or nothing — never a DIFFERENT vowel. Accepting any vowel would make "shit"
 * match "shot" and "piss" match "pass", which is a far worse failure than
 * missing an evasion; Layer 2 is there to catch what this misses.
 */
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

// ─────────────────────────────────────────────────────────────────────────
// Layer 1b: off-platform contact info.
//
// Lifted from moderate-message so chat and profiles judge contact info by the
// same rules. This matters more here than in chat, not less: a phone number
// sitting in a public bio skips the conversation entirely, so it is the one
// place where contact info never even reaches the chat scanner.
//
// Unlike chat, a street address in a bio is NOT legitimate context (there is no
// job being scheduled), but it is also not a contact channel — so, as in chat,
// these patterns target phones, emails, handles, and payment apps only.
// ─────────────────────────────────────────────────────────────────────────
const CONTACT_PATTERNS: Array<{ name: string; regex: RegExp }> = [
  {
    name: "phone_number",
    regex: /(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/,
  },
  {
    name: "spelled_out_number",
    regex:
      /(?:\b(?:zero|one|two|three|four|five|six|seven|eight|nine)\b[\s,.-]*){7,}/i,
  },
  {
    name: "email_address",
    regex: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/,
  },
  {
    name: "social_handle",
    regex: /(?<![\w.])@[A-Za-z0-9_.]{3,30}\b/,
  },
  {
    name: "payment_app",
    regex: /\b(?:venmo|cash\s?app|zelle|paypal|apple\s?pay)\b/i,
  },
  {
    name: "social_platform",
    regex:
      /\b(?:insta(?:gram)?|snap(?:chat)?|whats\s?app|telegram|signal|tik\s?tok|facebook|\bfb\b)\b/i,
  },
  {
    name: "off_platform_contact",
    regex: /\b(?:text|call|dm|hmu|hit me up)\s+(?:me|us)\b/i,
  },
];

/**
 * Layer 1 over one field.
 *
 * Profanity is tested against BOTH the normalized and the raw text, because the
 * two evasions pull in opposite directions: normalizing resolves leetspeak
 * ("sh1t" → "shit") but destroys vowel masks ("f@ck" → "fack", which matches
 * nothing). Each string catches what the other loses.
 *
 * Contact info is tested against the RAW text only — its patterns are about
 * digits and punctuation, and de-leeting would corrupt them ("555" → "sss").
 */
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
// Layer 2: gpt-5.4-nano backstop.
//
// Catches what a word list structurally cannot: obfuscation it hasn't seen,
// slurs and hate speech, sexual content, threats, and slander — an attack on a
// named person or a rival business, which is a real risk on a storefront bio and
// has no regex form at all.
//
// FLAG-ONLY and fail-open, exactly like chat: any error, timeout, missing key,
// or malformed response returns no flags. An OpenAI outage must never interfere
// with a provider editing their own profile.
// ─────────────────────────────────────────────────────────────────────────
const MODEL = "gpt-5.4-nano";
const MODEL_TIMEOUT_MS = 2500;

const FIELD_LABEL: Record<ProfileTextField, string> = {
  display_name: "public display name",
  bio: "public profile bio",
  company_name: "public company name",
};

const SCAN_POLICY = `You review the ${"{field}"} that a student service provider wrote for their public profile on a home-services marketplace. Neighbors read it when deciding who to hire. Decide whether it contains any of: profanity or vulgar language (including obfuscated spellings); slurs, hate speech, or harassment; sexual content; threats or glorified violence; illegal-activity solicitation; slander — an attack on, or a damaging accusation against, a named person, competitor, or business; or off-platform CONTACT CHANNELS, meaning a phone number (including spelled-out or obfuscated), a personal email, a social handle or platform, or a payment app (Venmo, Cash App, Zelle, PayPal, Apple Pay). Ordinary, professional self-description is fine and must not be flagged: naming their school, their major, their hometown, their work experience, the services they offer, or their general neighborhood is all legitimate. Mild enthusiasm, humor, and casual tone are fine. Report whether the text contains anything in the list above, and which categories apply. Do not rewrite anything.`;

// Structured output: guarantees a parseable, fixed-shape reply.
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
async function modelScan(
  field: ProfileTextField,
  text: string,
): Promise<string[]> {
  if (!hasOpenAiEnv()) return [];

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), MODEL_TIMEOUT_MS);
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          {
            role: "system",
            content: SCAN_POLICY.replace("{field}", FIELD_LABEL[field]),
          },
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
    // Detected but no category named — still flag it generically.
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
// Entry point.
// ─────────────────────────────────────────────────────────────────────────

/**
 * Scan one saved field and, if either layer flags it, log it for founder review
 * and email them. Call from `after()` — it is fire-and-forget, and it never
 * throws: the text is already saved, and a moderation failure must not surface
 * as a save failure the provider can't act on.
 */
export async function screenProfileText(opts: {
  providerId: string;
  userId: string;
  field: ProfileTextField;
  text: string;
}): Promise<void> {
  const text = opts.text.trim();
  if (!text) return;

  try {
    const matched = [...regexScan(text), ...(await modelScan(opts.field, text))];
    if (matched.length === 0) return;

    // profile_moderation_events has no client-write policy — service role only,
    // like moderation_events. Without the key we can't log, so say so loudly
    // rather than silently dropping a flag on the floor.
    if (!hasServiceRoleEnv()) {
      console.error(
        `[moderation] ${opts.field} flagged (${matched.join(", ")}) but SUPABASE_SERVICE_ROLE_KEY is unset — not logged.`,
      );
      return;
    }

    const admin = createAdminClient();
    const { error } = await admin.from("profile_moderation_events").insert({
      provider_id: opts.providerId,
      user_id: opts.userId,
      field: opts.field,
      flagged_text: text,
      matched_patterns: matched,
    });
    if (error) {
      console.error("could not log profile flag:", error.message);
      return;
    }

    await sendProfileFlagEmail({
      field: opts.field,
      matched,
      text,
      userId: opts.userId,
    });
  } catch (cause) {
    // Never throws: the save already succeeded and the response may already be
    // sent (this runs in `after()`).
    console.error("screenProfileText failed:", cause);
  }
}
