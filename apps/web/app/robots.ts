import type { MetadataRoute } from "next";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || "https://www.thecollegecrew.com";

/**
 * Private surfaces, kept in one place because every user-agent group has to
 * repeat them — see AI_CRAWLERS below.
 *
 * Every entry is a *prefix* match, so a missing trailing slash silently
 * deindexes its siblings. That has bitten this file twice: bare "/f" would
 * also catch /faq and /forgot-password (caught before it shipped), and bare
 * "/provider" caught /providers/<id> — the public profile pages — for real,
 * until a 2026-08-04 Semrush audit found 5 of them "Blocked from crawling."
 * Both are written with the slash now. Keep it that way.
 */
const DISALLOW = [
  "/account",
  "/admin",
  "/api",
  "/book",
  "/dashboard",
  // Flyer tracking paths rewrite to /browse, so indexing them would
  // duplicate that page.
  "/f/",
  "/login",
  "/messages",
  // Provider *work* surface (dashboard, jobs, onboarding). Not /providers/<id>,
  // which is public and carries the Service JSON-LD.
  "/provider/",
  "/signup",
];

/**
 * AI crawlers are allowed, deliberately.
 *
 * They were already allowed by falling through to the "*" group; naming them
 * makes it a decision on the record rather than a default nobody chose. The
 * pilot wants provider profiles reachable in AI answers — those pages carry
 * the richest structured data on the site.
 *
 * The tradeoff is real: profiles show student first names and photos. To
 * reverse this, swap `allow: "/"` for `disallow: "/"` on this group.
 *
 * Note two of these are not crawlers at all. Google-Extended and
 * Applebot-Extended are control tokens that gate whether content already
 * fetched by Googlebot/Applebot may be used for AI training; listing them
 * changes nothing today but states the position in the same breath.
 */
const AI_CRAWLERS = [
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "ClaudeBot",
  "Claude-User",
  "Claude-SearchBot",
  "PerplexityBot",
  "Perplexity-User",
  "Google-Extended",
  "Applebot-Extended",
];

export default function robots(): MetadataRoute.Robots {
  return {
    // A crawler obeys only the most specific user-agent group that matches it
    // and ignores "*" entirely, so the named group below cannot inherit the
    // disallow list — it has to repeat it. Dropping DISALLOW from that group
    // would hand these bots /admin, /api, /account and /messages.
    rules: [
      { userAgent: "*", allow: "/", disallow: DISALLOW },
      { userAgent: AI_CRAWLERS, allow: "/", disallow: DISALLOW },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
