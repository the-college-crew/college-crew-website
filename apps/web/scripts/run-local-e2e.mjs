import { execFileSync, spawnSync } from "node:child_process";

const status = execFileSync(
  "npx",
  ["supabase", "status", "--output", "env"],
  { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] },
);

const local = Object.fromEntries(
  status
    .split("\n")
    .map((line) => /^([A-Z_]+)="?(.*?)"?$/.exec(line.trim()))
    .filter(Boolean)
    .map((match) => [match[1], match[2].replace(/"$/, "")]),
);

for (const required of ["API_URL", "ANON_KEY", "SERVICE_ROLE_KEY"]) {
  if (!local[required]) throw new Error(`Local Supabase did not report ${required}.`);
}

const result = spawnSync("npx", ["playwright", "test", ...process.argv.slice(2)], {
  stdio: "inherit",
  env: {
    ...process.env,
    TZ: "America/Chicago",
    NEXT_PUBLIC_SUPABASE_URL: local.API_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: local.ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: local.SERVICE_ROLE_KEY,
    HOURLY_BOOKING_ENABLED: "true",
    BOOKING_REQUESTS_ENABLED: "true",
    // Shape-valid test-only placeholders. The browser journeys settle payment
    // state through synthetic database fixtures and never call Stripe/Resend.
    STRIPE_SECRET_KEY: "rk_test_local_e2e_placeholder",
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_test_local_e2e_placeholder",
    STRIPE_WEBHOOK_SECRET: "whsec_local_e2e_placeholder",
    RESEND_API_KEY: "re_local_e2e_placeholder",
    RESEND_WEBHOOK_SECRET: "whsec_local_e2e_placeholder",
    EMAIL_FROM: "College Crew Tests <no-reply@example.test>",
    NEXT_PUBLIC_SITE_URL: "https://example.test",
    BOOKING_CRON_SECRET: "local-e2e-cron-secret-at-least-32-characters",
    FOUNDER_OPERATIONS_EMAILS: "founder@example.test",
  },
});

process.exit(result.status ?? 1);
