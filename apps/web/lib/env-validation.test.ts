import { describe, expect, it } from "vitest";

import { getServerEnvironmentIssues, validateServerEnvironment } from "./env-validation";

const validRolloutEnvironment = {
  NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-placeholder",
  SUPABASE_SERVICE_ROLE_KEY: "service-placeholder",
  STRIPE_SECRET_KEY: "rk_test_placeholder",
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_test_placeholder",
  STRIPE_WEBHOOK_SECRET: "whsec_placeholder",
  RESEND_API_KEY: "re_placeholder",
  EMAIL_FROM: "College Crew <no-reply@send.example.com>",
  RESEND_WEBHOOK_SECRET: "whsec_resend_placeholder",
  NEXT_PUBLIC_SITE_URL: "https://example.com",
  BOOKING_CRON_SECRET: "a".repeat(32),
  FOUNDER_OPERATIONS_EMAILS: "ops@example.com,founder@example.com",
  HOURLY_BOOKING_ENABLED: "true",
  BOOKING_REQUESTS_ENABLED: "true",
};

describe("server environment validation", () => {
  it("keeps an unconfigured local checkout browsable while rollout is off", () => {
    expect(getServerEnvironmentIssues({})).toEqual([]);
  });

  it("accepts a complete test-mode hourly environment", () => {
    expect(getServerEnvironmentIssues(validRolloutEnvironment)).toEqual([]);
    expect(() => validateServerEnvironment(validRolloutEnvironment)).not.toThrow();
  });

  it("accepts a complete live-mode hourly environment", () => {
    expect(
      getServerEnvironmentIssues({
        ...validRolloutEnvironment,
        STRIPE_SECRET_KEY: "rk_live_placeholder",
        NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_live_placeholder",
      }),
    ).toEqual([]);
  });

  it("fails closed when requests are enabled without the hourly surface", () => {
    expect(
      getServerEnvironmentIssues({ BOOKING_REQUESTS_ENABLED: "true" }),
    ).toContain("BOOKING_REQUESTS_ENABLED requires HOURLY_BOOKING_ENABLED=true");
  });

  it("rejects mismatched Stripe modes and malformed scheduler configuration by name only", () => {
    const issues = getServerEnvironmentIssues({
      ...validRolloutEnvironment,
      STRIPE_SECRET_KEY: "sk_live_do-not-print",
      RESEND_WEBHOOK_SECRET: "not-a-signing-secret",
      NEXT_PUBLIC_SITE_URL: "http://example.com/path",
      BOOKING_CRON_SECRET: "short",
    });
    expect(issues).toContain(
      "Stripe secret and publishable keys must use the same mode",
    );
    expect(issues).toContain(
      "NEXT_PUBLIC_SITE_URL must be a canonical HTTPS origin with no path",
    );
    expect(issues).toContain("BOOKING_CRON_SECRET must be at least 32 characters");
    expect(issues).toContain(
      "RESEND_WEBHOOK_SECRET must be a webhook signing secret",
    );
    expect(issues.join(" ")).not.toContain("do-not-print");
  });
});
