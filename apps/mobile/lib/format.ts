/**
 * Display formatting shared across screens. Money is stored in cents; times are
 * ISO strings from Postgres. Keep these pure so screens stay declarative.
 */

/** 4500 -> "$45", 4550 -> "$45.50". Whole dollars drop the cents. */
export function formatMoney(cents: number): string {
  const dollars = cents / 100;
  return Number.isInteger(dollars) ? `$${dollars}` : `$${dollars.toFixed(2)}`;
}

/** An offered service's price line, e.g. "$30/hr" or "$45" (fixed per job). */
export function formatOfferedPrice(offered: {
  price_cents: number | null;
  hourly_rate_cents: number | null;
  price_type: "fixed" | "quote" | null;
  unit: "per_job" | "per_hour" | null;
}): string {
  if (offered.price_type === "quote") return "Quote";
  if (offered.unit === "per_hour" && offered.hourly_rate_cents != null) {
    return `${formatMoney(offered.hourly_rate_cents)}/hr`;
  }
  if (offered.price_cents != null) return formatMoney(offered.price_cents);
  return "Quote";
}

const DATE = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
});
const TIME = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" });

/** "Sat, Jul 20 · 9:00 AM" */
export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return `${DATE.format(d)} · ${TIME.format(d)}`;
}

/** "Jul 20" — compact, for dense rows. */
export function formatShortDate(iso: string): string {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(
    new Date(iso),
  );
}

/** Message-list relative stamp: "9:41 AM", "Yesterday", or "Jul 18". */
export function formatMessageTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return TIME.format(d);
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return formatShortDate(iso);
}

/** "Ari Schwartz" -> "AS"; falls back to a single glyph. */
export function initials(name: string | null | undefined): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "·";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** 60 -> "1 hr", 90 -> "1 hr 30 min", 45 -> "45 min". */
export function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} hr`;
  return `${h} hr ${m} min`;
}
