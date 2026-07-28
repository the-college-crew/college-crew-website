/** Join class names, skipping falsy values. */
export function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

/** All money is integer cents in the database; format at the edge. */
export function formatMoney(cents: number) {
  return usd.format(cents / 100);
}

/** Public pricing label for hourly services and supported quote offerings. */
export function formatOfferedPrice(offered: {
  hourly_rate_cents?: number | null;
  pricing_mode?: string | null;
  average_quote_cents?: number | null;
}) {
  if (offered.pricing_mode === "quote") {
    return offered.average_quote_cents == null
      ? "Quote required"
      : `Average quote ${formatMoney(offered.average_quote_cents)}`;
  }
  if (offered.hourly_rate_cents === null || offered.hourly_rate_cents === undefined) {
    return "Hourly rate needed";
  }
  return `${formatMoney(offered.hourly_rate_cents)}/hr`;
}

/**
 * The pilot serves one Central-time neighborhood, and booking times are captured
 * and stored as Central (see PILOT_TIME_ZONE in lib/booking/policy.ts). Server
 * components render in the runtime's default zone (UTC on Vercel), so every
 * date/time formatter must pin the zone or times display ~5-6h off.
 */
const APP_TIME_ZONE = "America/Chicago";

export function formatDate(iso: string) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: APP_TIME_ZONE,
  }).format(new Date(iso));
}

/**
 * Format a YYYY-MM-DD booking date without parsing it as a timestamp. These
 * date keys represent the customer's local calendar day, so parsing them as
 * UTC can display the prior day in Central time.
 */
export function formatLocalDate(date: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return date;

  const [, year, month, day] = match;
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(Number(year), Number(month) - 1, Number(day))));
}

export function formatDateTime(iso: string) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: APP_TIME_ZONE,
  }).format(new Date(iso));
}

export function formatTime(iso: string) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: APP_TIME_ZONE,
  }).format(new Date(iso));
}
