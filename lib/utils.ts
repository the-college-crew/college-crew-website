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

/** Hourly pilot display. Legacy fixed/quote values are deliberately ignored. */
export function formatOfferedPrice(offered: {
  hourly_rate_cents?: number | null;
}) {
  if (offered.hourly_rate_cents === null || offered.hourly_rate_cents === undefined) {
    return "Hourly rate needed";
  }
  return `${formatMoney(offered.hourly_rate_cents)}/hr`;
}

export function formatDate(iso: string) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(new Date(iso));
}

export function formatDateTime(iso: string) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function formatTime(iso: string) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}
