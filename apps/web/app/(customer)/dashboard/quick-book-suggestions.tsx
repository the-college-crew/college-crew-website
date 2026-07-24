import Link from "next/link";

import { buttonClasses } from "@/components/ui/button";
import type { ReplacementSuggestion } from "@/lib/booking/replacement-ranking";
import { formatDateTime, formatMoney } from "@/lib/utils";

/**
 * Quick-book shortlist on an attention card.
 *
 * The job details (time, address, duration, notes) are already saved, so
 * picking someone here carries all of it forward — the customer chooses a
 * student and confirms payment, and re-enters nothing. Payment can't be
 * one-tap: a first-hour hold is bound to one provider's Stripe account and
 * can't be moved, so a new student always needs a fresh authorization.
 *
 * Three kinds of row, and the difference is never blurred:
 *   exact      — books the time they asked for.
 *   time_shift — books a different time, stated on the row and confirmed again
 *                on the next screen. Never applied quietly.
 *   browse     — no slot behind it at all. Links to the student instead of the
 *                payment flow, so nothing implies a booking that can't happen.
 */
export function QuickBookSuggestions({
  bookingId,
  suggestions,
  originalStartAt,
}: {
  bookingId: string;
  suggestions: ReplacementSuggestion[];
  originalStartAt: string;
}) {
  if (suggestions.length === 0) return null;

  const bookable = suggestions.filter(
    (suggestion) => suggestion.kind !== "browse",
  );
  const anyAtOriginalTime = suggestions.some(
    (suggestion) => suggestion.kind === "exact",
  );

  return (
    <div className="mt-4">
      <p className="text-sm font-semibold text-ink">
        {anyAtOriginalTime
          ? "Quick book the same job"
          : bookable.length > 0
            ? "No one is open at your original time"
            : "Other students who do this"}
      </p>
      <p className="mt-0.5 text-xs text-mist">
        {anyAtOriginalTime
          ? "Your time, address, and job details carry over — just pick a student and confirm."
          : bookable.length > 0
            ? "These students can do this job at a different time. Your address and job details carry over."
            : `No one else is free around ${formatDateTime(originalStartAt)}, so these are the remaining students who offer this service.`}
      </p>

      <ul className="mt-2.5 space-y-2">
        {suggestions.map((suggestion) => (
          <li key={suggestion.providerServiceId}>
            <Link
              href={suggestionHref(bookingId, suggestion)}
              className="flex items-center justify-between gap-3 rounded-xl border border-line bg-paper p-3 transition-colors hover:border-crew-600 hover:bg-crew-50"
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-ink">
                  {suggestion.providerName}
                </span>
                <span className="mt-0.5 block text-xs text-mist">
                  {suggestion.rating
                    ? `${suggestion.rating.avg.toFixed(1)} ★ · ${suggestion.rating.count} review${suggestion.rating.count === 1 ? "" : "s"}`
                    : "New to the crew"}
                </span>
                {suggestion.kind === "time_shift" && suggestion.suggestedStartAt ? (
                  <span className="mt-1 inline-flex items-center rounded-full border border-gold-300 bg-gold-100 px-2 py-0.5 text-[11px] font-medium text-gold-900">
                    {formatDateTime(suggestion.suggestedStartAt)} · time change
                  </span>
                ) : suggestion.kind === "browse" ? (
                  <span className="mt-1 inline-flex items-center rounded-full border border-line bg-court px-2 py-0.5 text-[11px] font-medium text-ink-soft">
                    {suggestion.payoutReady
                      ? "Different time — you pick"
                      : "Still finishing setup"}
                  </span>
                ) : null}
              </span>
              <span className="shrink-0 text-right">
                <span className="block text-sm font-semibold text-quad-700">
                  {formatMoney(suggestion.hourlyRateCents)}/hr
                </span>
                <span className="mt-0.5 block text-xs text-mist" aria-hidden>
                  {suggestion.kind === "browse" ? "View →" : "Choose →"}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>

      {!anyAtOriginalTime && bookable.length > 0 ? (
        <p className="mt-2 text-xs text-mist">
          You asked for {formatDateTime(originalStartAt)}.
        </p>
      ) : null}
    </div>
  );
}

/**
 * Where a row goes. Tiers 1 and 2 have a validated slot, so they deep-link into
 * the replacement flow with the student preselected (`at` is re-validated
 * server-side and never trusted). A tier-3 row has no slot, so it points at the
 * student: their booking form if they can take payment, otherwise their profile,
 * which already explains that setup is in progress.
 */
function suggestionHref(
  bookingId: string,
  suggestion: ReplacementSuggestion,
): string {
  if (suggestion.kind === "browse") {
    return suggestion.payoutReady
      ? `/book/${suggestion.providerId}`
      : `/providers/${suggestion.providerId}`;
  }
  const params = new URLSearchParams({ ps: suggestion.providerServiceId });
  if (suggestion.suggestedStartAt) params.set("at", suggestion.suggestedStartAt);
  return `/bookings/${bookingId}/replace?${params.toString()}`;
}

/** Shared label so the card and the full page agree on wording. */
export const OTHER_OPTIONS_LABEL = "Other options";

export function OtherOptionsLink({
  href,
  variant = "secondary",
}: {
  href: string;
  variant?: "primary" | "secondary";
}) {
  return (
    <Link href={href} className={buttonClasses({ variant, size: "sm" })}>
      {OTHER_OPTIONS_LABEL}
    </Link>
  );
}
