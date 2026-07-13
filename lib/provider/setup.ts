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

export type ProviderAvailabilityValues = Pick<
  ProviderProfile,
  | "availability_weekdays"
  | "availability_start_local"
  | "availability_end_local"
  | "availability_note"
  | "service_zip"
  | "minimum_notice_hours"
>;

export type ProviderSetupFieldErrors = Partial<
  Record<
    | "weekdays"
    | "availabilityStart"
    | "availabilityEnd"
    | "availabilityNote"
    | "serviceZip"
    | "minimumNoticeHours",
    string
  >
>;

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
  };
}

export function parseProviderAvailabilityForm(
  formData: FormData,
): ProviderAvailabilityParseResult {
  const weekdays = PROVIDER_WEEKDAYS.filter(
    ({ value }) => formData.get(`weekday_${value}`) === "on",
  ).map(({ value }) => value);
  const availabilityStart = String(formData.get("availabilityStart") ?? "").trim();
  const availabilityEnd = String(formData.get("availabilityEnd") ?? "").trim();
  const availabilityNote = String(formData.get("availabilityNote") ?? "").trim();
  const serviceZip = String(formData.get("serviceZip") ?? "").trim();
  const noticeChoice = String(formData.get("noticeChoice") ?? "");
  const noticeRaw =
    noticeChoice === "custom"
      ? String(formData.get("customNoticeHours") ?? "").trim()
      : noticeChoice;
  const minimumNoticeHours = Number(noticeRaw);
  const fieldErrors: ProviderSetupFieldErrors = {};

  if (weekdays.length === 0) {
    fieldErrors.weekdays = "Select at least one day.";
  }
  if (!TIME_PATTERN.test(availabilityStart)) {
    fieldErrors.availabilityStart = "Choose a start time.";
  }
  if (!TIME_PATTERN.test(availabilityEnd)) {
    fieldErrors.availabilityEnd = "Choose an end time.";
  }
  if (
    !fieldErrors.availabilityStart &&
    !fieldErrors.availabilityEnd &&
    timeToMinutes(availabilityStart) >= timeToMinutes(availabilityEnd)
  ) {
    fieldErrors.availabilityEnd = "End time must be later than start time.";
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

  return {
    success: true,
    data: {
      availability_weekdays: weekdays,
      availability_start_local: availabilityStart,
      availability_end_local: availabilityEnd,
      availability_note: availabilityNote,
      service_zip: serviceZip,
      minimum_notice_hours: minimumNoticeHours,
    },
  };
}

export function isStructuredAvailabilityComplete(
  profile: Pick<
    ProviderProfile,
    | "availability_weekdays"
    | "availability_start_local"
    | "availability_end_local"
  >,
) {
  return Boolean(
    profile.availability_weekdays.length > 0 &&
      profile.availability_start_local &&
      profile.availability_end_local &&
      timeToMinutes(profile.availability_start_local.slice(0, 5)) <
        timeToMinutes(profile.availability_end_local.slice(0, 5)),
  );
}

export type ProviderReadinessRequirement = {
  key:
    | "verification"
    | "payouts"
    | "hourly_rate"
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
    | "availability_weekdays"
    | "availability_start_local"
    | "availability_end_local"
    | "service_zip"
  >,
  offering: { hourly_rate_cents: number | null; service_is_live: boolean },
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
      key: "hourly_rate",
      label: "Valid hourly rate",
      ready:
        offering.hourly_rate_cents !== null &&
        isHourlyRateValid(offering.hourly_rate_cents),
      private: false,
    },
    {
      key: "availability",
      label: "Days and shared hours set",
      ready: isStructuredAvailabilityComplete(profile),
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
