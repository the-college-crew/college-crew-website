/**
 * Hourly Booking v1 policy constants and pure calculations.
 *
 * Money is integer cents, percentages are integer basis points, and persisted
 * timestamps are UTC ISO strings. UI copy may format these values, but it must
 * not independently reproduce the policy math.
 */

export const PILOT_TIME_ZONE = "America/Chicago" as const;

export const BASIS_POINTS_SCALE = 10_000;
export const PLATFORM_FEE_BPS = 500;

export const HOURLY_RATE_MIN_CENTS = 2_000;
export const HOURLY_RATE_MAX_CENTS = 15_000;

export const BILLING_MINIMUM_MINUTES = 60;
export const BILLING_INCREMENT_MINUTES = 15;
export const CUSTOMER_ESTIMATE_MINUTES = { min: 60, max: 720 } as const;
export const PROVIDER_INVOICE_MINUTES = { min: 60, max: 1_440 } as const;

export const RESPONSE_WINDOW_HOURS = [1, 3, 5, 12, 24, 48, 72] as const;
export const DEFAULT_RESPONSE_WINDOW_HOURS = 3;

export const NOTICE_HOUR_PRESETS = [3, 6, 12, 24, 48, 72, 168] as const;
export const MINIMUM_NOTICE_HOURS = { min: 3, max: 168, default: 24 } as const;

export const INITIAL_PAYMENT_WINDOW_HOURS = 12;
export const CUSTOMER_REFUND_NOTICE_HOURS = 12;
export const INVOICE_REVIEW_HOURS = 24;
export const LATE_DISPUTE_DAYS = 7;

export const HOURLY_FEE_POLICY_VERSION = "hourly-v1-500bps" as const;
export const HOURLY_CANCELLATION_POLICY_VERSION = "hourly-v1-12h" as const;
export const HOURLY_AUTHORIZATION_VERSION =
  "hourly-v1-saved-method-2026-07-15" as const;

type DateInput = Date | string | number;

function toDate(value: DateInput): Date {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(date.getTime())) throw new RangeError("Invalid date input.");
  return date;
}

function assertInteger(value: number, label: string) {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`${label} must be a safe integer.`);
  }
}

/** Positive integer division rounded to the nearest integer. */
export function roundPositiveRatio(numerator: number, denominator: number) {
  assertInteger(numerator, "numerator");
  assertInteger(denominator, "denominator");
  if (numerator < 0 || denominator <= 0) {
    throw new RangeError("Ratio inputs must be positive.");
  }
  return Math.floor((numerator + Math.floor(denominator / 2)) / denominator);
}

export function isHourlyRateValid(rateCents: number) {
  return (
    Number.isSafeInteger(rateCents) &&
    rateCents >= HOURLY_RATE_MIN_CENTS &&
    rateCents <= HOURLY_RATE_MAX_CENTS
  );
}

export function isDurationValid(
  minutes: number,
  range: typeof CUSTOMER_ESTIMATE_MINUTES | typeof PROVIDER_INVOICE_MINUTES,
) {
  return (
    Number.isSafeInteger(minutes) &&
    minutes >= range.min &&
    minutes <= range.max &&
    minutes % BILLING_INCREMENT_MINUTES === 0
  );
}

/** Round elapsed wall time up to the next quarter hour and clamp invoice bounds. */
export function billableMinutesFromElapsed(actualMinutes: number) {
  if (!Number.isFinite(actualMinutes) || actualMinutes < 0) {
    throw new RangeError("Actual minutes must be a non-negative number.");
  }

  const rounded =
    Math.ceil(actualMinutes / BILLING_INCREMENT_MINUTES) *
    BILLING_INCREMENT_MINUTES;
  return Math.min(
    PROVIDER_INVOICE_MINUTES.max,
    Math.max(BILLING_MINIMUM_MINUTES, rounded),
  );
}

/** Exact master-plan subtotal formula, rounded to the nearest cent. */
export function calculateHourlySubtotalCents(
  hourlyRateCents: number,
  billableMinutes: number,
) {
  if (!isHourlyRateValid(hourlyRateCents)) {
    throw new RangeError("Hourly rate is outside the pilot range.");
  }
  if (!isDurationValid(billableMinutes, PROVIDER_INVOICE_MINUTES)) {
    throw new RangeError("Billable minutes are outside the invoice range.");
  }
  return roundPositiveRatio(hourlyRateCents * billableMinutes, 60);
}

export function calculatePlatformFeeCents(
  subtotalCents: number,
  feeBps = PLATFORM_FEE_BPS,
) {
  assertInteger(subtotalCents, "subtotalCents");
  assertInteger(feeBps, "feeBps");
  if (subtotalCents < 0 || feeBps < 0 || feeBps > BASIS_POINTS_SCALE) {
    throw new RangeError("Fee inputs are outside their valid range.");
  }
  return roundPositiveRatio(subtotalCents * feeBps, BASIS_POINTS_SCALE);
}

export type InvoiceAllocation = {
  subtotalCents: number;
  totalPlatformFeeCents: number;
  firstHourCents: number;
  firstHourPlatformFeeCents: number;
  remainingBalanceCents: number;
  remainingPlatformFeeCents: number;
};

/**
 * Allocate the total fee across the first-hour and balance charges. Computing
 * the second fee as the remainder prevents one-cent split-rounding drift.
 */
export function calculateInvoiceAllocation(
  hourlyRateCents: number,
  billableMinutes: number,
): InvoiceAllocation {
  const subtotalCents = calculateHourlySubtotalCents(
    hourlyRateCents,
    billableMinutes,
  );
  const totalPlatformFeeCents = calculatePlatformFeeCents(subtotalCents);
  const firstHourPlatformFeeCents = calculatePlatformFeeCents(hourlyRateCents);

  return {
    subtotalCents,
    totalPlatformFeeCents,
    firstHourCents: hourlyRateCents,
    firstHourPlatformFeeCents,
    remainingBalanceCents: Math.max(0, subtotalCents - hourlyRateCents),
    remainingPlatformFeeCents: Math.max(
      0,
      totalPlatformFeeCents - firstHourPlatformFeeCents,
    ),
  };
}

function addHours(value: DateInput, hours: number) {
  assertInteger(hours, "hours");
  return new Date(toDate(value).getTime() + hours * 60 * 60 * 1_000);
}

export function deriveResponseAlertAt(requestedAt: DateInput, hours: number) {
  if (!(RESPONSE_WINDOW_HOURS as readonly number[]).includes(hours)) {
    throw new RangeError("Unsupported response window.");
  }
  return addHours(requestedAt, hours);
}

export function eligibleResponseWindowHours(
  requestedAt: DateInput,
  scheduledAt: DateInput,
) {
  const scheduledTime = toDate(scheduledAt).getTime();
  return RESPONSE_WINDOW_HOURS.filter(
    (hours) => deriveResponseAlertAt(requestedAt, hours).getTime() < scheduledTime,
  );
}

export function deriveInitialPaymentDueAt(
  acceptedAt: DateInput,
  scheduledAt: DateInput,
) {
  const acceptanceDeadline = addHours(acceptedAt, INITIAL_PAYMENT_WINDOW_HOURS);
  const scheduled = toDate(scheduledAt);
  return acceptanceDeadline.getTime() < scheduled.getTime()
    ? acceptanceDeadline
    : scheduled;
}

export function deriveInvoiceAutochargeAt(submittedAt: DateInput) {
  return addHours(submittedAt, INVOICE_REVIEW_HOURS);
}

export function deriveLateDisputeDueAt(finalChargeSucceededAt: DateInput) {
  return addHours(finalChargeSucceededAt, LATE_DISPUTE_DAYS * 24);
}

export type CancellationClassification =
  | "full_refund"
  | "no_refund"
  | "no_payment"
  | "manual_review"
  | "provider_no_show_dispute";

export function classifyPreArrivalCancellation(input: {
  actor: "customer" | "provider";
  cancelledAt: DateInput;
  scheduledAt: DateInput;
  arrivedAt?: DateInput | null;
  hasCapturedFirstHour: boolean;
}): CancellationClassification {
  const cancelledAt = toDate(input.cancelledAt);
  const scheduledAt = toDate(input.scheduledAt);

  if (input.arrivedAt) return "manual_review";
  if (
    input.actor === "customer" &&
    cancelledAt.getTime() >= scheduledAt.getTime()
  ) {
    return "provider_no_show_dispute";
  }
  if (!input.hasCapturedFirstHour) return "no_payment";
  if (input.actor === "provider") return "full_refund";

  const noticeMs = scheduledAt.getTime() - cancelledAt.getTime();
  return noticeMs >= CUSTOMER_REFUND_NOTICE_HOURS * 60 * 60 * 1_000
    ? "full_refund"
    : "no_refund";
}

const pilotPartsFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: PILOT_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
  timeZoneName: "longOffset",
});

/** Stable Chicago-local fields for availability checks and DST-aware tests. */
export function getPilotLocalParts(value: DateInput) {
  const parts = Object.fromEntries(
    pilotPartsFormatter
      .formatToParts(toDate(value))
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );

  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    weekday: parts.weekday,
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
    offset: parts.timeZoneName,
  } as const;
}

const LOCAL_DATE_TIME_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

export type PilotLocalDateTimeResult =
  | { ok: true; date: Date }
  | { ok: false; reason: "invalid" | "nonexistent" | "ambiguous" };

/**
 * Convert a datetime-local value into one unambiguous Chicago instant. DST
 * gaps have no match and fall-back repetitions have two; both are rejected so
 * the server never guesses which appointment the customer intended.
 */
export function pilotLocalDateTimeToUtc(
  value: string,
): PilotLocalDateTimeResult {
  const match = LOCAL_DATE_TIME_PATTERN.exec(value);
  if (!match) return { ok: false, reason: "invalid" };

  const [, yearRaw, monthRaw, dayRaw, hourRaw, minuteRaw] = match;
  const target = {
    year: Number(yearRaw),
    month: Number(monthRaw),
    day: Number(dayRaw),
    hour: Number(hourRaw),
    minute: Number(minuteRaw),
  };
  if (
    target.month < 1 ||
    target.month > 12 ||
    target.day < 1 ||
    target.day > 31 ||
    target.hour > 23 ||
    target.minute > 59
  ) {
    return { ok: false, reason: "invalid" };
  }

  const wallClockUtc = Date.UTC(
    target.year,
    target.month - 1,
    target.day,
    target.hour,
    target.minute,
  );
  const matches: Date[] = [];

  // Chicago is UTC-5/-6. A broad bounded search also keeps this correct if
  // historical offset rules change without relying on a third-party library.
  for (let deltaMinutes = -12 * 60; deltaMinutes <= 12 * 60; deltaMinutes += 15) {
    const candidate = new Date(wallClockUtc + deltaMinutes * 60_000);
    const parts = getPilotLocalParts(candidate);
    if (
      parts.year === target.year &&
      parts.month === target.month &&
      parts.day === target.day &&
      parts.hour === target.hour &&
      parts.minute === target.minute
    ) {
      matches.push(candidate);
    }
  }

  if (matches.length === 0) return { ok: false, reason: "nonexistent" };
  if (matches.length > 1) return { ok: false, reason: "ambiguous" };
  return { ok: true, date: matches[0] };
}

function clockMinutes(value: string) {
  const [hours, minutes] = value.slice(0, 5).split(":").map(Number);
  return hours * 60 + minutes;
}

const PILOT_WEEKDAY_INDEX: Record<string, number> = {
  Mon: 0,
  Tue: 1,
  Wed: 2,
  Thu: 3,
  Fri: 4,
  Sat: 5,
  Sun: 6,
};

export function doesSlotFitPilotAvailability(input: {
  scheduledAt: DateInput;
  estimatedMinutes: number;
  weekdays: readonly number[];
  startLocal: string;
  endLocal: string;
}) {
  if (!isDurationValid(input.estimatedMinutes, CUSTOMER_ESTIMATE_MINUTES)) {
    return false;
  }
  const start = toDate(input.scheduledAt);
  const end = new Date(start.getTime() + input.estimatedMinutes * 60_000);
  const startParts = getPilotLocalParts(start);
  const endParts = getPilotLocalParts(end);
  const weekday = PILOT_WEEKDAY_INDEX[startParts.weekday];

  return (
    startParts.year === endParts.year &&
    startParts.month === endParts.month &&
    startParts.day === endParts.day &&
    input.weekdays.includes(weekday) &&
    startParts.hour * 60 + startParts.minute >= clockMinutes(input.startLocal) &&
    endParts.hour * 60 + endParts.minute <= clockMinutes(input.endLocal)
  );
}
