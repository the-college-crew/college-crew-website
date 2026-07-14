import { createHash, randomUUID } from "node:crypto";

import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

import type { Database, UserRole } from "../../lib/db/types";
import {
  getMasterAgreementSnapshot,
  LEGAL_CONTENT_VERSION,
} from "../../lib/legal/waivers";

const password = "Synthetic-Phase5!Pass9";
const runId = randomUUID().slice(0, 8);
const serviceId = randomUUID();
const providerProfileId = randomUUID();
const offeringId = randomUUID();
const customerEmail = `phase5-customer-${runId}@example.test`;
const providerEmail = `phase5-provider-${runId}@example.test`;

// Booking A settles a remaining balance; booking B is a zero-balance job.
const bookingA = randomUUID();
const bookingB = randomUUID();

const admin = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

let customerId: string;
let providerUserId: string;

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

/** A `booked` hourly job scheduled inside the arrival grace, with its saved
 * first-hour payment already captured. */
async function insertBookedJob(id: string) {
  const now = Date.now();
  const scheduledAt = new Date(now + 10 * 60_000); // 10 min out (arrivable)
  const createdAt = new Date(now - 2 * 3_600_000);
  const acceptedAt = new Date(now - 3_600_000);
  const { error } = await admin.from("bookings").insert({
    id,
    customer_id: customerId,
    provider_id: providerProfileId,
    service_id: serviceId,
    status: "booked",
    scheduled_at: scheduledAt.toISOString(),
    address: "500 Synthetic Street, Chicago, IL",
    details: "Work-invoicing fixture",
    price_cents: 5000,
    platform_fee_cents: 250,
    created_at: createdAt.toISOString(),
    accepted_at: acceptedAt.toISOString(),
    initial_payment_due_at: scheduledAt.toISOString(),
    booking_flow: "hourly_v1",
    estimated_minutes: 120,
    job_zip: "60615",
    hourly_rate_cents_snapshot: 5000,
    platform_fee_bps: 500,
    billing_minimum_minutes: 60,
    billing_increment_minutes: 15,
    cancellation_notice_hours: 12,
    pilot_timezone: "America/Chicago",
    response_window_hours: 1,
    response_alert_at: new Date(createdAt.getTime() + 3_600_000).toISOString(),
    customer_name_snapshot: "Synthetic Customer",
    provider_display_name_snapshot: "E2E Provider Five",
    service_name_snapshot: "Synthetic Hourly Service",
    fee_policy_version: "hourly-v1-500bps",
    cancellation_policy_version: "hourly-v1-12h",
    terms_version: LEGAL_CONTENT_VERSION,
    customer_authorization_version: "hourly-v1-saved-method",
    policy_snapshot: { platform_fee_bps: 500 },
    customer_authorization_snapshot: {
      version: "hourly-v1-saved-method",
      scope: "booking_only",
    },
  });
  if (error) throw error;

  const { error: payError } = await admin.from("booking_payments").insert({
    booking_id: id,
    kind: "first_hour",
    amount_cents: 5000,
    application_fee_cents: 250,
    currency: "usd",
    status: "succeeded",
    idempotency_key: `fh_${id}`,
    stripe_connected_account_id: "acct_e2e_phase5",
    stripe_customer_id: "cus_e2e_phase5",
    stripe_payment_method_id: "pm_e2e_phase5",
    customer_authorization_version: "hourly-v1-saved-method",
    succeeded_at: new Date().toISOString(),
  });
  if (payError) throw payError;
}

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

async function bookingStatus(id: string) {
  const { data } = await admin
    .from("bookings")
    .select("status")
    .eq("id", id)
    .single();
  return data!.status;
}

test.beforeAll(async () => {
  customerId = await createUser(customerEmail, "customer", "Synthetic Customer");
  providerUserId = await createUser(providerEmail, "provider", "Provider Five Owner");

  await admin
    .from("profiles")
    .update({
      address_line1: "500 Synthetic Street",
      city: "Chicago",
      state: "IL",
      postal_code: "60615",
    })
    .eq("id", customerId);

  const { error: providerError } = await admin.from("provider_profiles").insert({
    id: providerProfileId,
    user_id: providerUserId,
    display_name: "E2E Provider Five",
    bio: "Synthetic provider five",
    verification_status: "approved",
    stripe_account_id: "acct_e2e_phase5",
    stripe_transfers_active: true,
    stripe_transfers_checked_at: new Date().toISOString(),
    service_zip: "60615",
    availability_weekdays: [0, 1, 2, 3, 4, 5, 6],
    availability_start_local: "00:00",
    availability_end_local: "23:45",
    minimum_notice_hours: 3,
  });
  if (providerError) throw providerError;

  const { error: serviceError } = await admin.from("services").insert({
    id: serviceId,
    name: "Synthetic Hourly Service",
    slug: `synthetic-hourly-${runId}`,
    category: "Test",
    is_live: true,
  });
  if (serviceError) throw serviceError;

  const { error: offeringError } = await admin.from("provider_services").insert({
    id: offeringId,
    provider_id: providerProfileId,
    service_id: serviceId,
    price_cents: 0,
    price_type: "quote",
    unit: "per_hour",
    hourly_rate_cents: 5000,
  });
  if (offeringError) throw offeringError;

  await Promise.all([
    acceptMasterAgreement(customerId, "customer", "Synthetic Customer"),
    acceptMasterAgreement(providerUserId, "provider", "Provider Five Owner"),
  ]);

  await insertBookedJob(bookingA);
  await insertBookedJob(bookingB);
});

test.afterAll(async () => {
  await admin.from("bookings").delete().eq("customer_id", customerId);
  await admin.from("provider_services").delete().eq("service_id", serviceId);
  await admin.from("services").delete().eq("id", serviceId);
  await admin.from("provider_profiles").delete().eq("id", providerProfileId);
  await Promise.all([
    admin.auth.admin.deleteUser(customerId),
    admin.auth.admin.deleteUser(providerUserId),
  ]);
});

test("arrive, invoice over/under estimate, review, and settle a balance", async ({
  browser,
}) => {
  const providerContext = await browser.newContext();
  const providerPage = await providerContext.newPage();
  await login(providerPage, providerEmail);

  await providerPage.goto("/provider/jobs");
  const jobCard = providerPage.locator(`[data-booking-id="${bookingA}"]`);
  await jobCard.getByRole("button", { name: "Arrived" }).click();
  await expect(providerPage).toHaveURL(
    new RegExp(`/provider/jobs/${bookingA}/complete`),
  );
  expect(await bookingStatus(bookingA)).toBe("in_progress");

  // Over-estimate reveals the mandatory explanation; back under hides it.
  const minutes = providerPage.locator("#submittedMinutes");
  await minutes.fill("150");
  await expect(
    providerPage.getByText("Explain the time beyond the estimate"),
  ).toBeVisible();
  await minutes.fill("90");
  await expect(
    providerPage.getByText("Explain the time beyond the estimate"),
  ).toHaveCount(0);

  await providerPage
    .getByRole("button", { name: "Submit job complete & invoice" })
    .click();
  await expect
    .poll(() => bookingStatus(bookingA))
    .toBe("invoice_review");

  const { data: invoice } = await admin
    .from("booking_invoices")
    .select("id, remaining_balance_cents, subtotal_cents")
    .eq("booking_id", bookingA)
    .single();
  expect(invoice!.subtotal_cents).toBe(7500);
  expect(invoice!.remaining_balance_cents).toBe(2500);

  // Customer reaches the itemized invoice from the dashboard.
  const customerContext = await browser.newContext();
  const customerPage = await customerContext.newPage();
  await login(customerPage, customerEmail);
  await customerPage.goto("/dashboard");
  await customerPage
    .locator(`[data-booking-id="${bookingA}"]`)
    .getByRole("link", { name: "Review & pay" })
    .click();
  await expect(customerPage).toHaveURL(
    new RegExp(`/bookings/${bookingA}/invoice`),
  );
  await expect(customerPage.getByText("Remaining balance")).toBeVisible();
  await expect(
    customerPage.getByRole("button", { name: "Confirm & pay $25.00" }),
  ).toBeVisible();

  // Settle the balance via the service-role RPC (simulating the webhook).
  const { error: insertError } = await admin.from("booking_payments").insert({
    booking_id: bookingA,
    invoice_id: invoice!.id,
    kind: "balance",
    amount_cents: 2500,
    application_fee_cents: 125,
    currency: "usd",
    status: "created",
    idempotency_key: `bal_${bookingA}_0`,
    stripe_connected_account_id: "acct_e2e_phase5",
    stripe_payment_intent_id: `pi_e2e_bal_${runId}`,
    customer_authorization_version: "hourly-v1-saved-method",
  });
  if (insertError) throw insertError;
  const { data: settled } = await admin.rpc("settle_balance_payment", {
    p_stripe_payment_intent_id: `pi_e2e_bal_${runId}`,
    p_succeeded_at: new Date().toISOString(),
  });
  expect(settled).toBe("completed");
  expect(await bookingStatus(bookingA)).toBe("completed");

  // The invoice page now reads paid, and a review is available (RLS gates it).
  await customerPage.reload();
  await expect(customerPage.getByText("Paid in full")).toBeVisible();
  await customerPage.goto("/dashboard?tab=past");
  await expect(
    customerPage
      .locator(`[data-booking-id="${bookingA}"]`)
      .getByRole("button", { name: "Leave review" }),
  ).toBeVisible();

  await providerContext.close();
  await customerContext.close();
});

test("a one-hour job completes with no balance through the UI", async ({
  browser,
}) => {
  const providerContext = await browser.newContext();
  const providerPage = await providerContext.newPage();
  await login(providerPage, providerEmail);

  await providerPage.goto("/provider/jobs");
  await providerPage
    .locator(`[data-booking-id="${bookingB}"]`)
    .getByRole("button", { name: "Arrived" })
    .click();
  await expect(providerPage).toHaveURL(
    new RegExp(`/provider/jobs/${bookingB}/complete`),
  );
  await providerPage.locator("#submittedMinutes").fill("60");
  await providerPage
    .getByRole("button", { name: "Submit job complete & invoice" })
    .click();
  await expect.poll(() => bookingStatus(bookingB)).toBe("invoice_review");

  const customerContext = await browser.newContext();
  const customerPage = await customerContext.newPage();
  await login(customerPage, customerEmail);
  await customerPage.goto(`/bookings/${bookingB}/invoice`);
  await expect(customerPage.getByText("Remaining balance")).toBeVisible();
  await customerPage
    .getByRole("button", { name: "Confirm & complete" })
    .click();
  // Settling a zero balance needs no Stripe call; the page re-renders as paid.
  await expect(customerPage.getByText("Paid in full")).toBeVisible();
  expect(await bookingStatus(bookingB)).toBe("completed");

  await providerContext.close();
  await customerContext.close();
});
