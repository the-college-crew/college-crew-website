import { createHash, randomUUID } from "node:crypto";

import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

import type { Database, UserRole } from "../../lib/db/types";
import {
  getMasterAgreementSnapshot,
  LEGAL_CONTENT_VERSION,
} from "../../lib/legal/waivers";

const password = "Synthetic-Phase3!Pass9";
const runId = randomUUID().slice(0, 8);
const serviceId = randomUUID();
const providerOneProfileId = randomUUID();
const providerTwoProfileId = randomUUID();
const providerOneOfferingId = randomUUID();
const providerTwoOfferingId = randomUUID();
const customerEmail = `phase3-customer-${runId}@example.test`;
const providerOneEmail = `phase3-provider-one-${runId}@example.test`;
const providerTwoEmail = `phase3-provider-two-${runId}@example.test`;

const admin = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

let customerId: string;
let providerOneUserId: string;
let providerTwoUserId: string;
let responseAlertBookingId: string;
let declineBookingId: string;
let expiredBookingId: string;

function futureDate(days: number, hour: number) {
  const value = new Date();
  value.setDate(value.getDate() + days);
  value.setHours(hour, 0, 0, 0);
  return value;
}

function localInput(value: Date) {
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(value.getHours())}:${pad(value.getMinutes())}`;
}

async function createUser(email: string, role: UserRole, fullName: string) {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { role, full_name: fullName },
  });
  if (error || !data.user) throw error ?? new Error("Synthetic user missing.");
  return data.user.id;
}

async function acceptMasterAgreement(
  userId: string,
  role: Extract<UserRole, "customer" | "provider">,
  signerName: string,
) {
  const snapshot = getMasterAgreementSnapshot(role);
  const contentHash = createHash("sha256")
    .update(JSON.stringify(snapshot))
    .digest("hex");
  const { error } = await admin.from("legal_acceptances").insert({
    user_id: userId,
    booking_id: null,
    kind: "master_agreement",
    role,
    version: LEGAL_CONTENT_VERSION,
    content_hash: contentHash,
    signer_name: signerName,
    snapshot,
  });
  if (error) throw error;
}

async function insertHourlyFixture(input: {
  id: string;
  providerId: string;
  providerName: string;
  hourlyRateCents: number;
  scheduledAt: Date;
  createdAt: Date;
  details: string;
}) {
  const { error } = await admin.from("bookings").insert({
    id: input.id,
    customer_id: customerId,
    provider_id: input.providerId,
    service_id: serviceId,
    status: "requested",
    scheduled_at: input.scheduledAt.toISOString(),
    address: "100 Synthetic Street, Chicago, IL",
    details: input.details,
    price_cents: input.hourlyRateCents,
    platform_fee_cents: Math.round(input.hourlyRateCents * 0.05),
    created_at: input.createdAt.toISOString(),
    booking_flow: "hourly_v1",
    estimated_minutes: 120,
    job_zip: "60615",
    hourly_rate_cents_snapshot: input.hourlyRateCents,
    platform_fee_bps: 500,
    billing_minimum_minutes: 60,
    billing_increment_minutes: 15,
    cancellation_notice_hours: 12,
    pilot_timezone: "America/Chicago",
    response_window_hours: 1,
    response_alert_at: new Date(input.createdAt.getTime() + 3_600_000).toISOString(),
    customer_name_snapshot: "Synthetic Customer",
    provider_display_name_snapshot: input.providerName,
    service_name_snapshot: "Synthetic Hourly Service",
    fee_policy_version: "hourly-v1-500bps",
    cancellation_policy_version: "hourly-v1-12h",
    terms_version: LEGAL_CONTENT_VERSION,
    customer_authorization_version: "hourly-v1-saved-method",
    policy_snapshot: {
      platform_fee_bps: 500,
      billing_minimum_minutes: 60,
      billing_increment_minutes: 15,
      cancellation_notice_hours: 12,
      pilot_timezone: "America/Chicago",
    },
    customer_authorization_snapshot: {
      version: "hourly-v1-saved-method",
      scope: "booking_only",
    },
  });
  if (error) throw error;
}

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

test.beforeAll(async () => {
  customerId = await createUser(customerEmail, "customer", "Synthetic Customer");
  providerOneUserId = await createUser(
    providerOneEmail,
    "provider",
    "Provider One Owner",
  );
  providerTwoUserId = await createUser(
    providerTwoEmail,
    "provider",
    "Provider Two Owner",
  );

  const { error: profileError } = await admin
    .from("profiles")
    .update({
      address_line1: "100 Synthetic Street",
      city: "Chicago",
      state: "IL",
      postal_code: "60615",
    })
    .eq("id", customerId);
  if (profileError) throw profileError;

  const { error: providerError } = await admin.from("provider_profiles").insert([
    {
      id: providerOneProfileId,
      user_id: providerOneUserId,
      display_name: "E2E Provider One",
      bio: "Synthetic provider one",
      verification_status: "approved",
      stripe_account_id: "acct_e2e_phase3_one",
      stripe_transfers_active: true,
      stripe_transfers_checked_at: new Date().toISOString(),
      service_zip: "60614",
      availability_weekdays: [0, 1, 2, 3, 4, 5, 6],
      availability_start_local: "09:00",
      availability_end_local: "17:00",
      minimum_notice_hours: 3,
    },
    {
      id: providerTwoProfileId,
      user_id: providerTwoUserId,
      display_name: "E2E Provider Two",
      bio: "Synthetic provider two",
      verification_status: "approved",
      stripe_account_id: "acct_e2e_phase3_two",
      stripe_transfers_active: true,
      stripe_transfers_checked_at: new Date().toISOString(),
      service_zip: "60615",
      availability_weekdays: [0, 1, 2, 3, 4, 5, 6],
      availability_start_local: "09:00",
      availability_end_local: "17:00",
      minimum_notice_hours: 3,
    },
  ]);
  if (providerError) throw providerError;

  const { error: serviceError } = await admin.from("services").insert({
    id: serviceId,
    name: "Synthetic Hourly Service",
    slug: `synthetic-hourly-${runId}`,
    category: "Test",
    is_live: true,
  });
  if (serviceError) throw serviceError;

  const { error: offeringError } = await admin.from("provider_services").insert([
    {
      id: providerOneOfferingId,
      provider_id: providerOneProfileId,
      service_id: serviceId,
      price_cents: 0,
      price_type: "quote",
      unit: "per_hour",
      hourly_rate_cents: 5000,
    },
    {
      id: providerTwoOfferingId,
      provider_id: providerTwoProfileId,
      service_id: serviceId,
      price_cents: 0,
      price_type: "quote",
      unit: "per_hour",
      hourly_rate_cents: 4500,
    },
  ]);
  if (offeringError) throw offeringError;

  await Promise.all([
    acceptMasterAgreement(customerId, "customer", "Synthetic Customer"),
    acceptMasterAgreement(providerOneUserId, "provider", "Provider One Owner"),
    acceptMasterAgreement(providerTwoUserId, "provider", "Provider Two Owner"),
  ]);

  responseAlertBookingId = randomUUID();
  declineBookingId = randomUUID();
  expiredBookingId = randomUUID();
  await insertHourlyFixture({
    id: responseAlertBookingId,
    providerId: providerOneProfileId,
    providerName: "E2E Provider One",
    hourlyRateCents: 5000,
    scheduledAt: futureDate(7, 11),
    createdAt: new Date(Date.now() - 2 * 3_600_000),
    details: "Replacement fixture",
  });
  await insertHourlyFixture({
    id: declineBookingId,
    providerId: providerOneProfileId,
    providerName: "E2E Provider One",
    hourlyRateCents: 5000,
    scheduledAt: futureDate(8, 13),
    createdAt: new Date(),
    details: "Decline fixture",
  });
  await insertHourlyFixture({
    id: expiredBookingId,
    providerId: providerTwoProfileId,
    providerName: "E2E Provider Two",
    hourlyRateCents: 4500,
    scheduledAt: new Date(Date.now() - 60_000),
    createdAt: new Date(Date.now() - 2 * 3_600_000),
    details: "Expiry fixture",
  });
});

test.afterAll(async () => {
  await admin.from("bookings").delete().eq("customer_id", customerId);
  await admin.from("provider_services").delete().eq("service_id", serviceId);
  await admin.from("services").delete().eq("id", serviceId);
  await admin
    .from("provider_profiles")
    .delete()
    .in("id", [providerOneProfileId, providerTwoProfileId]);
  await Promise.all([
    admin.auth.admin.deleteUser(customerId),
    admin.auth.admin.deleteUser(providerOneUserId),
    admin.auth.admin.deleteUser(providerTwoUserId),
  ]);
});

test("browse, request, accept, replace, cancel, decline, and expire without Stripe", async ({
  browser,
}) => {
  const customerContext = await browser.newContext();
  const customerPage = await customerContext.newPage();
  await login(customerPage, customerEmail);

  await customerPage.goto(`/browse?service=synthetic-hourly-${runId}&sort=location`);
  await customerPage.getByLabel("Job ZIP").fill("60615");
  await customerPage.getByRole("button", { name: "Use ZIP" }).click();
  const providerCards = customerPage.locator('a[href^="/providers/"]');
  const cardTexts = await providerCards.allTextContents();
  expect(cardTexts.findIndex((text) => text.includes("E2E Provider Two"))).toBeLessThan(
    cardTexts.findIndex((text) => text.includes("E2E Provider One")),
  );

  const requestedStart = futureDate(5, 10);
  await customerPage.goto(`/book/${providerOneProfileId}`);
  await customerPage
    .getByLabel("Service", { exact: true })
    .selectOption(providerOneOfferingId);
  await customerPage.getByLabel("Date & time").fill(localInput(requestedStart));
  await customerPage.getByLabel("Estimated duration").selectOption("120");
  await customerPage.getByLabel("Provider response window").selectOption("1");
  await customerPage.getByLabel("Service address").fill("100 Synthetic Street, Chicago, IL");
  await customerPage.getByLabel("Job ZIP").fill("60615");
  await customerPage.getByLabel("Job details").fill("Customer-created hourly request");
  await customerPage.getByRole("button", { name: "Send hourly request" }).click();
  await expect(customerPage).toHaveURL(/\/dashboard\?requested=1/);
  await expect(customerPage.getByText("Request sent.")).toBeVisible();

  const requestedBookingId = await expect
    .poll(async () => {
      const { data } = await admin
        .from("bookings")
        .select("id")
        .eq("customer_id", customerId)
        .eq("details", "Customer-created hourly request")
        .maybeSingle();
      return data?.id;
    })
    .not.toBeUndefined()
    .then(async () => {
      const { data } = await admin
        .from("bookings")
        .select("id")
        .eq("customer_id", customerId)
        .eq("details", "Customer-created hourly request")
        .single();
      return data!.id;
    });

  const providerContext = await browser.newContext();
  const providerPage = await providerContext.newPage();
  await login(providerPage, providerOneEmail);
  const requestCard = providerPage.locator(
    `[data-booking-id="${requestedBookingId}"]`,
  );
  await requestCard.getByRole("button", { name: "Accept" }).click();
  await requestCard.getByRole("button", { name: /Yes, I.m in/ }).click();
  await expect(providerPage).toHaveURL(/\/messages\//);

  await customerPage.goto("/dashboard");
  const acceptedCard = customerPage.locator(
    `[data-booking-id="${requestedBookingId}"]`,
  );
  await expect(acceptedCard.getByText("Accepted — awaiting payment")).toBeVisible();
  await expect(
    acceptedCard.getByRole("link", { name: "Pay first hour" }),
  ).toBeVisible();
  await expect(acceptedCard.getByRole("link", { name: "Confirm & pay" })).toHaveCount(0);

  // The hourly first-hour confirm surface renders (Stripe is blank in E2E).
  await acceptedCard.getByRole("link", { name: "Pay first hour" }).click();
  await expect(customerPage).toHaveURL(
    new RegExp(`/bookings/${requestedBookingId}/confirm`),
  );
  await expect(
    customerPage.getByText("Confirm & pay the first hour"),
  ).toBeVisible();
  await customerPage.goto("/dashboard");

  const alertCard = customerPage.locator(
    `[data-booking-id="${responseAlertBookingId}"]`,
  );
  await expect(alertCard.getByText("The response deadline has passed.")).toBeVisible();
  await alertCard.getByRole("link", { name: "Find replacement" }).click();
  await expect(customerPage.getByText("E2E Provider Two")).toBeVisible();
  await customerPage
    .getByRole("button", { name: "Withdraw original & send replacement" })
    .click();
  await expect(customerPage).toHaveURL(/\/dashboard\?replaced=1/);

  const { data: replacement } = await admin
    .from("bookings")
    .select("id")
    .eq("replacement_for_booking_id", responseAlertBookingId)
    .single();
  const replacementCard = customerPage.locator(
    `[data-booking-id="${replacement!.id}"]`,
  );
  await replacementCard.getByRole("button", { name: "Cancel request" }).click();
  await expect
    .poll(async () => {
      const { data } = await admin
        .from("bookings")
        .select("status")
        .eq("id", replacement!.id)
        .single();
      return data?.status;
    })
    .toBe("cancelled");
  await customerPage.getByRole("tab", { name: "Past" }).click();
  await expect(replacementCard.getByText("Cancelled")).toBeVisible();

  await providerPage.goto("/provider/dashboard");
  const declineCard = providerPage.locator(`[data-booking-id="${declineBookingId}"]`);
  await declineCard.getByRole("button", { name: "Decline" }).click();
  await declineCard
    .getByLabel(/What.s the problem/)
    .fill("I cannot make this time.");
  await declineCard.getByRole("button", { name: "Send & decline" }).click();
  await expect(providerPage).toHaveURL(/\/messages\//);

  await customerPage.goto("/dashboard");
  await expect(
    customerPage
      .locator(`[data-booking-id="${declineBookingId}"]`)
      .getByText("Declined", { exact: true }),
  ).toBeVisible();
  await customerPage.getByRole("tab", { name: "Past" }).click();
  await expect(
    customerPage
      .locator(`[data-booking-id="${expiredBookingId}"]`)
      .getByText("Expired", { exact: true }),
  ).toBeVisible();

  await customerContext.close();
  await providerContext.close();
});
