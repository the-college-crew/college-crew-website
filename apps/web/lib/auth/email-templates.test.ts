import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const ORIGIN = "https://www.thecollegecrew.com";
const TOKEN_HASH = "pkce_test_token_hash";
const PROVIDER_NEXT =
  "{{ if eq .Data.signup_intent `provider` }}%2Fprovider%2Fonboarding%2Faccount{{ else }}%2Fdashboard{{ end }}";

type TemplateCase = {
  file: string;
  type: string;
  next: string;
};

function readTemplate(file: string) {
  // supabase/ lives at the repo root, two levels above the apps/web
  // workspace that vitest runs from.
  return readFileSync(
    resolve(process.cwd(), "..", "..", "supabase", "templates", file),
    "utf8",
  );
}

function renderLinks(source: string, providerIntent = false) {
  const rendered = source
    .replaceAll(
      PROVIDER_NEXT,
      providerIntent
        ? "%2Fprovider%2Fonboarding%2Faccount"
        : "%2Fdashboard",
    )
    .replaceAll("{{ .RedirectTo }}", ORIGIN)
    .replaceAll("{{ .TokenHash }}", TOKEN_HASH);

  return [...rendered.matchAll(/href="([^"]*token_hash=[^"]*)"/g)].map(
    ([, href]) => new URL(href),
  );
}

function expectValidLinks(
  source: string,
  expected: Pick<TemplateCase, "type" | "next">,
  providerIntent = false,
) {
  expect(source).not.toContain("{{ .RedirectTo }}&token_hash=");
  const urls = renderLinks(source, providerIntent);
  expect(urls).toHaveLength(3);

  for (const url of urls) {
    expect(url.origin).toBe(ORIGIN);
    expect(url.pathname).toBe("/auth/callback");
    expect(url.searchParams.get("token_hash")).toBe(TOKEN_HASH);
    expect(url.searchParams.get("type")).toBe(expected.type);
    expect(url.searchParams.get("next")).toBe(expected.next);
    expect(url.href.match(/\?/g)).toHaveLength(1);
  }
}

describe("Supabase Auth email template links", () => {
  it("routes customer signup confirmations to the customer dashboard", () => {
    expectValidLinks(readTemplate("confirmation.html"), {
      type: "signup",
      next: "/dashboard",
    });
  });

  it("routes provider-intent confirmations back to onboarding", () => {
    expectValidLinks(
      readTemplate("confirmation.html"),
      {
        type: "signup",
        next: "/provider/onboarding/account",
      },
      true,
    );
  });

  it.each<TemplateCase>([
    {
      file: "recovery.html",
      type: "recovery",
      next: "/reset-password",
    },
    {
      file: "magic_link.html",
      type: "magiclink",
      next: "/dashboard",
    },
    {
      file: "email_change.html",
      type: "email_change",
      next: "/account",
    },
  ])("builds a valid callback URL in $file", ({ file, type, next }) => {
    expectValidLinks(readTemplate(file), { type, next });
  });
});
