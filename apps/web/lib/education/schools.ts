import { z } from "zod";

const SCORECARD_ENDPOINT =
  "https://api.data.gov/ed/collegescorecard/v1/schools.json";
const SCORECARD_FIELDS = [
  "id",
  "school.name",
  "school.city",
  "school.state",
  "school.school_url",
  "latest.student.size",
].join(",");
const SCHOOL_DOMAIN_PATTERN =
  /^[a-z0-9](?:[a-z0-9-]{0,62}\.)+[a-z]{2,63}$/;

export const schoolProfileInputSchema = z.object({
  schoolName: z
    .string()
    .trim()
    .min(1, "Enter your college or university.")
    .max(160, "Keep the school name under 160 characters."),
  schoolId: z
    .union([
      z.literal(""),
      z
        .string()
        .trim()
        .regex(/^\d+$/, "Choose the school again or save it as a custom school."),
    ])
    .default(""),
  greekOrganization: z
    .string()
    .trim()
    .max(120, "Keep the Greek house or chapter under 120 characters.")
    .default(""),
});

export type SchoolSuggestion = {
  id: number;
  name: string;
  city: string;
  state: string;
  domain: string | null;
};

type ScorecardSchool = {
  id?: unknown;
  "school.name"?: unknown;
  "school.city"?: unknown;
  "school.state"?: unknown;
  "school.school_url"?: unknown;
  "latest.student.size"?: unknown;
};

type ScorecardResponse = {
  results?: ScorecardSchool[];
};

export class SchoolDirectoryError extends Error {}

/**
 * Convert the Scorecard website field into the bare domain accepted by the
 * logo CDN. Invalid/missing URLs stay null; provider input is never used here.
 */
export function normalizeSchoolDomain(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const raw = value.trim();
  if (!raw) return null;

  try {
    const url = new URL(
      /^[a-z][a-z\d+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`,
    );
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
    const domain = hostname.startsWith("www.") ? hostname.slice(4) : hostname;
    return SCHOOL_DOMAIN_PATTERN.test(domain) ? domain : null;
  } catch {
    return null;
  }
}

function apiKey() {
  const configured = process.env.COLLEGE_SCORECARD_API_KEY?.trim();
  if (configured) return configured;
  return process.env.NODE_ENV === "production" ? null : "DEMO_KEY";
}

function mapSchool(row: ScorecardSchool): (SchoolSuggestion & { size: number }) | null {
  if (
    typeof row.id !== "number" ||
    typeof row["school.name"] !== "string" ||
    typeof row["school.city"] !== "string" ||
    typeof row["school.state"] !== "string"
  ) {
    return null;
  }
  return {
    id: row.id,
    name: row["school.name"],
    city: row["school.city"],
    state: row["school.state"],
    domain: normalizeSchoolDomain(row["school.school_url"]),
    size:
      typeof row["latest.student.size"] === "number"
        ? row["latest.student.size"]
        : 0,
  };
}

function withoutSize(
  school: SchoolSuggestion & { size: number },
): SchoolSuggestion {
  return {
    id: school.id,
    name: school.name,
    city: school.city,
    state: school.state,
    domain: school.domain,
  };
}

function nameRank(name: string, query: string) {
  const candidate = name.toLocaleLowerCase();
  const normalized = query.toLocaleLowerCase();
  if (candidate === normalized) return 0;
  if (candidate.startsWith(normalized)) return 1;
  const wordIndex = candidate.indexOf(` ${normalized}`);
  if (wordIndex >= 0) return 2;
  return 3;
}

function scorecardUrl(params: Record<string, string>) {
  const url = new URL(SCORECARD_ENDPOINT);
  url.searchParams.set("_fields", SCORECARD_FIELDS);
  for (const [name, value] of Object.entries(params)) {
    url.searchParams.set(name, value);
  }
  return url;
}

async function fetchScorecard(url: URL): Promise<ScorecardResponse> {
  const key = apiKey();
  if (!key) {
    throw new SchoolDirectoryError(
      "School suggestions are not configured. You can still enter your school manually.",
    );
  }
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { "X-Api-Key": key },
      next: { revalidate: 86_400 },
      signal: AbortSignal.timeout(4_000),
    });
  } catch {
    throw new SchoolDirectoryError(
      "School suggestions are temporarily unavailable. You can still enter your school manually.",
    );
  }
  if (!response.ok) {
    throw new SchoolDirectoryError(
      "School suggestions are temporarily unavailable. You can still enter your school manually.",
    );
  }
  return (await response.json()) as ScorecardResponse;
}

/** Search currently operating Scorecard institutions by partial school name. */
export async function searchSchools(query: string): Promise<SchoolSuggestion[]> {
  const normalized = query.trim().replace(/\s+/g, " ");
  if (normalized.length < 2 || normalized.length > 100) return [];

  const payload = await fetchScorecard(
    scorecardUrl({
      "school.name": normalized,
      "school.operating": "1",
      _per_page: "10",
    }),
  );

  return (payload.results ?? [])
    .map(mapSchool)
    .filter((school): school is SchoolSuggestion & { size: number } =>
      Boolean(school),
    )
    .toSorted(
      (a, b) =>
        nameRank(a.name, normalized) - nameRank(b.name, normalized) ||
        b.size - a.size ||
        a.name.localeCompare(b.name),
    )
    .slice(0, 8)
    .map(withoutSize);
}

/** Canonicalize a submitted UnitID instead of trusting hidden browser fields. */
export async function getSchoolByScorecardId(
  id: number,
): Promise<SchoolSuggestion | null> {
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  const payload = await fetchScorecard(
    scorecardUrl({
      id: String(id),
      _per_page: "1",
    }),
  );
  const school = payload.results?.[0] ? mapSchool(payload.results[0]) : null;
  if (!school) return null;
  return withoutSize(school);
}

export type ResolvedSchoolProfile = {
  school_name: string;
  school_scorecard_id: number | null;
  school_domain: string | null;
  greek_organization: string;
};

/**
 * Resolve one form submission. A blank schoolId means the provider intentionally
 * chose the custom-school fallback. An unchanged recognized school can retain
 * its canonical metadata without spending another API request.
 */
export async function resolveSchoolProfileInput(
  input: z.infer<typeof schoolProfileInputSchema>,
  current?: {
    school_name: string;
    school_scorecard_id: number | null;
    school_domain: string | null;
  },
): Promise<ResolvedSchoolProfile> {
  const greek_organization = input.greekOrganization;
  if (!input.schoolId) {
    return {
      school_name: input.schoolName,
      school_scorecard_id: null,
      school_domain: null,
      greek_organization,
    };
  }

  const id = Number(input.schoolId);
  if (
    current?.school_scorecard_id === id &&
    current.school_name === input.schoolName
  ) {
    return {
      school_name: current.school_name,
      school_scorecard_id: current.school_scorecard_id,
      school_domain: current.school_domain,
      greek_organization,
    };
  }

  const recognized = await getSchoolByScorecardId(id);
  if (!recognized) {
    throw new SchoolDirectoryError(
      "We could not verify that school selection. Choose it again, or edit the name to save it as a custom school.",
    );
  }
  return {
    school_name: recognized.name,
    school_scorecard_id: recognized.id,
    school_domain: recognized.domain,
    greek_organization,
  };
}
