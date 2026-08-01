import { describe, expect, it } from "vitest";

import { assertLocalSupabase } from "./admin";

/**
 * The guard is the only thing standing between a stray `npx playwright test`
 * and synthetic providers on the live Browse page, so it gets its own test.
 * Runs under vitest, not Playwright (see the `.spec.ts` / `.test.ts` split in
 * playwright.config.ts and vitest.config.ts) — it touches no database.
 */
describe("assertLocalSupabase", () => {
  it.each([
    "http://127.0.0.1:54321",
    "http://localhost:54321",
    "https://localhost",
  ])("accepts the local stack at %s", (url) => {
    expect(assertLocalSupabase(url)).toBe(url);
  });

  it.each([
    ["the shared dev==prod project", "https://abcdefghijklm.supabase.co"],
    ["a pooler host", "https://aws-0-us-east-1.pooler.supabase.com"],
    ["a lookalike hostname", "https://localhost.evil.example.com"],
  ])("refuses %s", (_label, url) => {
    expect(() => assertLocalSupabase(url)).toThrow(/REFUSING TO RUN/);
  });

  it("refuses an unset URL", () => {
    expect(() => assertLocalSupabase(undefined)).toThrow(/unset/);
  });

  it("refuses a malformed URL", () => {
    expect(() => assertLocalSupabase("not-a-url")).toThrow(/not a valid URL/);
  });
});
