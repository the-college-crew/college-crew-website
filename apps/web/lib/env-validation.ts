type Environment = Record<string, string | undefined>;

const REQUIRED_FOR_DEPLOYMENT = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
] as const;

const REQUIRED_FOR_HOURLY_ROLLOUT = [
  "STRIPE_SECRET_KEY",
  "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "RESEND_API_KEY",
  "EMAIL_FROM",
  "RESEND_WEBHOOK_SECRET",
  "NEXT_PUBLIC_SITE_URL",
  "BOOKING_CRON_SECRET",
  "FOUNDER_OPERATIONS_EMAILS",
] as const;

function enabled(value: string | undefined) {
  return value?.trim().toLowerCase() === "true";
}

function isHttpUrl(value: string, httpsOnly = false) {
  try {
    const parsed = new URL(value);
    return httpsOnly
      ? parsed.protocol === "https:" && parsed.pathname === "/"
      : parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/**
 * Validate names and shapes without ever including a secret value in an
 * exception. Deployed Vercel instances require the core Supabase contract;
 * the complete payment/email/scheduler contract becomes mandatory whenever
 * either hourly rollout flag is enabled.
 */
export function getServerEnvironmentIssues(env: Environment = process.env) {
  const issues: string[] = [];
  const hourlyEnabled = enabled(env.HOURLY_BOOKING_ENABLED);
  const requestsEnabled = enabled(env.BOOKING_REQUESTS_ENABLED);
  const deployed = env.VERCEL_ENV === "preview" || env.VERCEL_ENV === "production";

  if (requestsEnabled && !hourlyEnabled) {
    issues.push("BOOKING_REQUESTS_ENABLED requires HOURLY_BOOKING_ENABLED=true");
  }

  const required = new Set<string>();
  if (deployed) REQUIRED_FOR_DEPLOYMENT.forEach((name) => required.add(name));
  if (hourlyEnabled || requestsEnabled) {
    REQUIRED_FOR_DEPLOYMENT.forEach((name) => required.add(name));
    REQUIRED_FOR_HOURLY_ROLLOUT.forEach((name) => required.add(name));
  }
  for (const name of required) {
    if (!env[name]?.trim()) issues.push(`${name} is required`);
  }

  const url = env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (url && !isHttpUrl(url)) issues.push("NEXT_PUBLIC_SUPABASE_URL must be an HTTP(S) URL");

  const siteUrl = env.NEXT_PUBLIC_SITE_URL?.trim();
  if (siteUrl && !isHttpUrl(siteUrl, deployed || hourlyEnabled)) {
    issues.push("NEXT_PUBLIC_SITE_URL must be a canonical HTTPS origin with no path");
  }

  const stripeSecret = env.STRIPE_SECRET_KEY?.trim();
  if (stripeSecret && !/^(sk|rk)_test_/.test(stripeSecret)) {
    issues.push("STRIPE_SECRET_KEY must be a Stripe test-mode secret or restricted key");
  }
  const publishable = env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim();
  if (publishable && !publishable.startsWith("pk_test_")) {
    issues.push("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY must be a Stripe test-mode key");
  }
  const webhookSecret = env.STRIPE_WEBHOOK_SECRET?.trim();
  if (webhookSecret && !webhookSecret.startsWith("whsec_")) {
    issues.push("STRIPE_WEBHOOK_SECRET must be a webhook signing secret");
  }

  const cronSecret = env.BOOKING_CRON_SECRET?.trim();
  if (cronSecret && cronSecret.length < 32) {
    issues.push("BOOKING_CRON_SECRET must be at least 32 characters");
  }

  const founderEmails = env.FOUNDER_OPERATIONS_EMAILS?.split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (env.FOUNDER_OPERATIONS_EMAILS && founderEmails?.some((value) => !isEmail(value))) {
    issues.push("FOUNDER_OPERATIONS_EMAILS must be a comma-separated email list");
  }

  const emailFrom = env.EMAIL_FROM?.trim();
  const emailAddress = emailFrom?.match(/<([^>]+)>$/)?.[1] ?? emailFrom;
  if (emailFrom && (!emailAddress || !isEmail(emailAddress))) {
    issues.push("EMAIL_FROM must contain a valid email address");
  }

  const resendWebhookSecret = env.RESEND_WEBHOOK_SECRET?.trim();
  if (resendWebhookSecret && !resendWebhookSecret.startsWith("whsec_")) {
    issues.push("RESEND_WEBHOOK_SECRET must be a webhook signing secret");
  }

  return issues;
}

export function validateServerEnvironment(env: Environment = process.env) {
  const issues = getServerEnvironmentIssues(env);
  if (issues.length > 0) {
    throw new Error(`Invalid server environment: ${issues.join("; ")}`);
  }
}
