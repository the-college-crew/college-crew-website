import {
  HOURLY_RATE_MAX_CENTS,
  HOURLY_RATE_MIN_CENTS,
  MINIMUM_NOTICE_HOURS,
  NOTICE_HOUR_PRESETS,
  PLATFORM_FEE_BPS,
  BASIS_POINTS_SCALE,
  isHourlyRateValid,
} from "../booking/policy";
import type {
  PriceType,
  PriceUnit,
  ProviderProfile,
  VerificationStatus,
} from "../db/types";

export const PROVIDER_WEEKDAYS = [
  { value: 0, short: "Mon", long: "Monday" },
  { value: 1, short: "Tue", long: "Tuesday" },
  { value: 2, short: "Wed", long: "Wednesday" },
  { value: 3, short: "Thu", long: "Thursday" },
  { value: 4, short: "Fri", long: "Friday" },
  { value: 5, short: "Sat", long: "Saturday" },
  { value: 6, short: "Sun", long: "Sunday" },
] as const;

export const PROVIDER_FEE_PERCENT =
  (PLATFORM_FEE_BPS / BASIS_POINTS_SCALE) * 100;

/** Client convenience constraints; the upper bound stays server-error-only. */
export const HOURLY_RATE_INPUT_CONSTRAINTS = {
  min: HOURLY_RATE_MIN_CENTS / 100,
  step: "0.01",
} as const;

export const QUOTE_INPUT_CONSTRAINTS = {
  min: 20,
  max: 10_000,
  step: "0.01",
} as const;

export type PricingMode = "hourly" | "quote";

export const QUOTE_SERVICE_SLUGS = [
  "hauling",
  "pressure-washing",
  "window-washing",
] as const;

/** Pilot services whose scope commonly needs visual review before pricing. */
export function supportsQuotePricing(serviceSlug?: string | null) {
  return QUOTE_SERVICE_SLUGS.some((slug) => slug === serviceSlug);
}

export function isOfferingPricingReady(offering: {
  hourly_rate_cents: number | null;
  pricing_mode?: string;
  service_slug?: string;
}) {
  return offering.pricing_mode === "quote"
    ? supportsQuotePricing(offering.service_slug) &&
        offering.hourly_rate_cents === null
    : offering.hourly_rate_cents !== null &&
        isHourlyRateValid(offering.hourly_rate_cents);
}

/** One stored availability window: a single weekday's local hours. */
export type AvailabilityWindow = {
  weekday: number;
  start_local: string;
  end_local: string;
};

/**
 * Editor/display grouping of windows that share the same hours
 * (e.g. Mon-Thu 9-5). Pure UI concept — storage stays one row per weekday.
 */
export type AvailabilityDayGroup = {
  weekdays: number[];
  start: string;
  end: string;
};

export const MAX_AVAILABILITY_WINDOWS = PROVIDER_WEEKDAYS.length;

export type ProviderAvailabilityValues = Pick<
  ProviderProfile,
  "availability_note" | "service_zip" | "minimum_notice_hours"
> & { windows: AvailabilityWindow[] };

export type AvailabilityWindowFieldErrors = Partial<
  Record<"days" | "start" | "end", string>
>;

export type ProviderSetupFieldErrors = Partial<
  Record<
    "weekdays" | "availabilityNote" | "serviceZip" | "minimumNoticeHours",
    string
  >
> & {
  /** Per-group errors from the grouped availability editor, keyed by group index. */
  windows?: Record<number, AvailabilityWindowFieldErrors>;
};

export type ProviderAvailabilityParseResult =
  | { success: true; data: ProviderAvailabilityValues }
  | { success: false; fieldErrors: ProviderSetupFieldErrors };

const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const ZIP_PATTERN = /^\d{5}$/;
const RATE_PATTERN = /^(?:0|[1-9]\d*)(?:\.(\d{1,2}))?$/;

function timeToMinutes(value: string) {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

/** Parse dollars exactly, without floating-point rounding. */
export function parseHourlyRateInput(value: FormDataEntryValue | null):
  | { success: true; cents: number }
  | { success: false; error: string } {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return { success: false, error: "Enter an hourly rate." };

  const match = RATE_PATTERN.exec(raw);
  if (!match) {
    return { success: false, error: "Enter a dollar amount with up to two decimals." };
  }

  const [whole] = raw.split(".");
  const fractional = (match[1] ?? "").padEnd(2, "0");
  const cents = Number(whole) * 100 + Number(fractional || 0);
  if (!isHourlyRateValid(cents)) {
    return {
      success: false,
      error: `Hourly rate must be between $${(
        HOURLY_RATE_MIN_CENTS / 100
      ).toFixed(2)} and $${(HOURLY_RATE_MAX_CENTS / 100).toFixed(2)}.`,
    };
  }

  return { success: true, cents };
}

/** Parse an optional informational average quote without floating-point math. */
export function parseAverageQuoteInput(value: FormDataEntryValue | null):
  | { success: true; cents: number | null }
  | { success: false; error: string } {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return { success: true, cents: null };

  const match = RATE_PATTERN.exec(raw);
  if (!match) {
    return { success: false, error: "Enter a dollar amount with up to two decimals." };
  }

  const [whole] = raw.split(".");
  const fractional = (match[1] ?? "").padEnd(2, "0");
  const cents = Number(whole) * 100 + Number(fractional || 0);
  if (
    cents < QUOTE_INPUT_CONSTRAINTS.min * 100 ||
    cents > QUOTE_INPUT_CONSTRAINTS.max * 100
  ) {
    return {
      success: false,
      error: `Average quote must be between $${QUOTE_INPUT_CONSTRAINTS.min} and $${QUOTE_INPUT_CONSTRAINTS.max.toLocaleString()}.`,
    };
  }

  return { success: true, cents };
}

/** Expand/contract persistence without converting an existing legacy price. */
export function buildHourlyOfferingPersistenceRow(input: {
  providerId: string;
  serviceId: string;
  hourlyRateCents: number;
  existing?: {
    price_cents: number;
    price_type: PriceType;
    unit: PriceUnit;
  };
}) {
  return {
    provider_id: input.providerId,
    service_id: input.serviceId,
    price_cents: input.existing?.price_cents ?? 0,
    price_type: input.existing?.price_type ?? ("quote" as const),
    unit: input.existing?.unit ?? ("per_hour" as const),
    hourly_rate_cents: input.hourlyRateCents,
    pricing_mode: "hourly" as const,
    average_quote_cents: null,
  };
}

/** Supported quote persistence. The legacy columns retain valid neutral values. */
export function buildQuoteOfferingPersistenceRow(input: {
  providerId: string;
  serviceId: string;
  averageQuoteCents: number | null;
}) {
  return {
    provider_id: input.providerId,
    service_id: input.serviceId,
    price_cents: 0,
    price_type: "quote" as const,
    unit: "per_job" as const,
    hourly_rate_cents: null,
    pricing_mode: "quote" as const,
    average_quote_cents: input.averageQuoteCents,
  };
}

/**
 * Group stored windows by shared hours for the editor and display surfaces.
 * Groups are ordered by their earliest weekday; weekdays within a group are
 * ascending. Round-trips stably: flatten(group(windows)) === sorted(windows).
 */
export function groupAvailabilityWindows(
  windows: readonly AvailabilityWindow[],
): AvailabilityDayGroup[] {
  const groups = new Map<string, AvailabilityDayGroup>();
  for (const window of [...windows].sort((a, b) => a.weekday - b.weekday)) {
    const start = window.start_local.slice(0, 5);
    const end = window.end_local.slice(0, 5);
    const key = `${start}|${end}`;
    const group = groups.get(key);
    if (group) {
      group.weekdays.push(window.weekday);
    } else {
      groups.set(key, { weekdays: [window.weekday], start, end });
    }
  }
  return [...groups.values()];
}

export function parseProviderAvailabilityForm(
  formData: FormData,
): ProviderAvailabilityParseResult {
  const rawCount = Number(String(formData.get("windowCount") ?? ""));
  const windowCount =
    Number.isInteger(rawCount) && rawCount > 0
      ? Math.min(rawCount, MAX_AVAILABILITY_WINDOWS)
      : 0;
  const availabilityNote = String(formData.get("availabilityNote") ?? "").trim();
  const serviceZip = String(formData.get("serviceZip") ?? "").trim();
  const noticeChoice = String(formData.get("noticeChoice") ?? "");
  const noticeRaw =
    noticeChoice === "custom"
      ? String(formData.get("customNoticeHours") ?? "").trim()
      : noticeChoice;
  const minimumNoticeHours = Number(noticeRaw);
  const fieldErrors: ProviderSetupFieldErrors = {};
  const windowErrors: Record<number, AvailabilityWindowFieldErrors> = {};
  const claimedWeekdays = new Set<number>();
  const windows: AvailabilityWindow[] = [];

  if (windowCount === 0) {
    fieldErrors.weekdays = "Add at least one availability window.";
  }

  for (let index = 0; index < windowCount; index += 1) {
    const groupErrors: AvailabilityWindowFieldErrors = {};
    const days = PROVIDER_WEEKDAYS.filter(
      ({ value }) => formData.get(`windowDay_${index}_${value}`) === "on",
    ).map(({ value }) => value);
    const start = String(formData.get(`windowStart_${index}`) ?? "").trim();
    const end = String(formData.get(`windowEnd_${index}`) ?? "").trim();

    if (days.length === 0) {
      groupErrors.days = "Select at least one day.";
    } else {
      // Defense-in-depth: the editor disables pills claimed by other groups.
      const duplicate = days.find((day) => claimedWeekdays.has(day));
      if (duplicate !== undefined) {
        const { long } = PROVIDER_WEEKDAYS[duplicate];
        groupErrors.days = `${long} is already in another time window.`;
      }
    }
    if (!TIME_PATTERN.test(start)) {
      groupErrors.start = "Choose a start time.";
    }
    if (!TIME_PATTERN.test(end)) {
      groupErrors.end = "Choose an end time.";
    } else if (
      !groupErrors.start &&
      timeToMinutes(start) >= timeToMinutes(end)
    ) {
      groupErrors.end = "End time must be later than start time.";
    }

    if (Object.keys(groupErrors).length > 0) {
      windowErrors[index] = groupErrors;
      continue;
    }
    for (const day of days) {
      claimedWeekdays.add(day);
      windows.push({ weekday: day, start_local: start, end_local: end });
    }
  }

  if (Object.keys(windowErrors).length > 0) {
    fieldErrors.windows = windowErrors;
  }
  if (availabilityNote.length > 1_000) {
    fieldErrors.availabilityNote = "Keep the public note to 1,000 characters or fewer.";
  }
  if (!ZIP_PATTERN.test(serviceZip)) {
    fieldErrors.serviceZip = "Enter a five-digit service ZIP.";
  }
  if (
    !Number.isInteger(minimumNoticeHours) ||
    minimumNoticeHours < MINIMUM_NOTICE_HOURS.min ||
    minimumNoticeHours > MINIMUM_NOTICE_HOURS.max
  ) {
    fieldErrors.minimumNoticeHours = `Enter a whole number from ${MINIMUM_NOTICE_HOURS.min} to ${MINIMUM_NOTICE_HOURS.max} hours.`;
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { success: false, fieldErrors };
  }

  windows.sort((a, b) => a.weekday - b.weekday);
  return {
    success: true,
    data: {
      windows,
      availability_note: availabilityNote,
      service_zip: serviceZip,
      minimum_notice_hours: minimumNoticeHours,
    },
  };
}

export function isStructuredAvailabilityComplete(
  windows: readonly AvailabilityWindow[],
) {
  // Row shape is constraint-guaranteed (valid weekday, start < end), so
  // completeness degenerates to "at least one window exists".
  return windows.length > 0;
}

export type ProviderReadinessRequirement = {
  key:
    | "verification"
    | "payouts"
    | "pricing"
    | "availability"
    | "service_zip"
    | "live_service";
  label: string;
  ready: boolean;
  private: boolean;
};

export function getOfferingReadiness(
  profile: Pick<
    ProviderProfile,
    | "verification_status"
    | "stripe_account_id"
    | "stripe_transfers_active"
    | "stripe_transfers_checked_at"
    | "service_zip"
  >,
  offering: {
    hourly_rate_cents: number | null;
    pricing_mode?: PricingMode;
    average_quote_cents?: number | null;
    service_slug?: string;
    service_is_live: boolean;
  },
  windows: readonly AvailabilityWindow[],
) {
  const requirements: ProviderReadinessRequirement[] = [
    {
      key: "verification",
      label: "Founder verification approved",
      ready: profile.verification_status === "approved",
      private: true,
    },
    {
      key: "payouts",
      label: "Stripe payouts active",
      ready: Boolean(
        profile.stripe_account_id &&
          profile.stripe_transfers_active &&
          profile.stripe_transfers_checked_at,
      ),
      private: true,
    },
    {
      key: "pricing",
      label:
        offering.pricing_mode === "quote"
          ? "Flat quote enabled"
          : "Valid hourly rate",
      ready:
        isOfferingPricingReady(offering),
      private: false,
    },
    {
      key: "availability",
      label: "Days and hours set",
      ready: isStructuredAvailabilityComplete(windows),
      private: false,
    },
    {
      key: "service_zip",
      label: "Private service ZIP set",
      ready: Boolean(profile.service_zip && ZIP_PATTERN.test(profile.service_zip)),
      private: true,
    },
    {
      key: "live_service",
      label: "Service is live",
      ready: offering.service_is_live,
      private: false,
    },
  ];

  return {
    bookable: requirements.every((requirement) => requirement.ready),
    requirements,
    missing: requirements.filter((requirement) => !requirement.ready),
  };
}

export function formatAvailabilityDays(weekdays: readonly number[]) {
  if (weekdays.length === PROVIDER_WEEKDAYS.length) return "Every day";
  return PROVIDER_WEEKDAYS.filter(({ value }) => weekdays.includes(value))
    .map(({ short }) => short)
    .join(", ");
}

export function formatLocalTime(value: string) {
  const [hour, minute] = value.slice(0, 5).split(":").map(Number);
  const period = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${String(minute).padStart(2, "0")} ${period}`;
}

export function formatAvailabilityWindow(
  start: string | null,
  end: string | null,
) {
  if (!start || !end) return null;
  return `${formatLocalTime(start)}–${formatLocalTime(end)} CT`;
}

export function defaultNoticeChoice(hours: number) {
  return (NOTICE_HOUR_PRESETS as readonly number[]).includes(hours)
    ? String(hours)
    : "custom";
}

export function verificationLabel(status: VerificationStatus) {
  if (status === "approved") return "Approved";
  if (status === "rejected") return "Needs attention";
  return "Pending review";
}
