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

/** "$45", "$25/hr", or "Quote" — one rule everywhere prices render. */
export function formatOfferedPrice(offered: {
  price_cents: number;
  price_type: "fixed" | "quote";
  unit: "per_job" | "per_hour";
}) {
  if (offered.price_type === "quote") return "Quote";
  const base = formatMoney(offered.price_cents);
  return offered.unit === "per_hour" ? `${base}/hr` : base;
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
