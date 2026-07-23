import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getSchoolByScorecardId,
  normalizeSchoolDomain,
  resolveSchoolProfileInput,
  searchSchools,
} from "./schools";

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.COLLEGE_SCORECARD_API_KEY;
});

describe("school recognition", () => {
  it.each([
    ["www.northwestern.edu/", "northwestern.edu"],
    ["https://www.depaul.edu/about", "depaul.edu"],
    ["HTTP://UIC.EDU", "uic.edu"],
    ["", null],
    ["not a domain", null],
    ["localhost", null],
    ["javascript:alert(1)", null],
  ])("normalizes %j to %j", (input, expected) => {
    expect(normalizeSchoolDomain(input)).toBe(expected);
  });

  it("keeps custom schools usable without a directory request", async () => {
    await expect(
      resolveSchoolProfileInput({
        schoolName: "My Local College",
        schoolId: "",
        greekOrganization: "Alpha House",
      }),
    ).resolves.toEqual({
      school_name: "My Local College",
      school_scorecard_id: null,
      school_domain: null,
      greek_organization: "Alpha House",
    });
  });

  it("retains unchanged canonical metadata without another lookup", async () => {
    await expect(
      resolveSchoolProfileInput(
        {
          schoolName: "Northwestern University",
          schoolId: "147767",
          greekOrganization: "",
        },
        {
          school_name: "Northwestern University",
          school_scorecard_id: 147767,
          school_domain: "northwestern.edu",
        },
      ),
    ).resolves.toMatchObject({
      school_name: "Northwestern University",
      school_scorecard_id: 147767,
      school_domain: "northwestern.edu",
    });
  });

  it("canonicalizes a submitted UnitID from the server response", async () => {
    process.env.COLLEGE_SCORECARD_API_KEY = "test-key";
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          results: [
            {
              id: 147767,
              "school.name": "Northwestern University",
              "school.city": "Evanston",
              "school.state": "IL",
              "school.school_url": "www.northwestern.edu/",
              "latest.student.size": 9201,
            },
          ],
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(getSchoolByScorecardId(147767)).resolves.toEqual({
      id: 147767,
      name: "Northwestern University",
      city: "Evanston",
      state: "IL",
      domain: "northwestern.edu",
    });
    const calledUrl = fetchMock.mock.calls[0][0] as URL;
    const calledInit = fetchMock.mock.calls[0][1] as RequestInit;
    expect(calledUrl.searchParams.get("id")).toBe("147767");
    expect(calledUrl.searchParams.has("api_key")).toBe(false);
    expect(calledInit.headers).toEqual({ "X-Api-Key": "test-key" });
  });

  it("ranks an exact school name before larger partial-name matches", async () => {
    process.env.COLLEGE_SCORECARD_API_KEY = "test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            results: [
              {
                id: 160038,
                "school.name": "Northwestern State University of Louisiana",
                "school.city": "Natchitoches",
                "school.state": "LA",
                "school.school_url": "nsula.edu",
                "latest.student.size": 12000,
              },
              {
                id: 147767,
                "school.name": "Northwestern University",
                "school.city": "Evanston",
                "school.state": "IL",
                "school.school_url": "northwestern.edu",
                "latest.student.size": 9201,
              },
            ],
          }),
          { status: 200 },
        ),
      ),
    );

    const results = await searchSchools("Northwestern University");
    expect(results.map(({ id }) => id)).toEqual([147767, 160038]);
  });
});
