import { createHash, randomUUID } from "node:crypto";

import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

import type { BookingStatus, Database, UserRole } from "../../lib/db/types";
import {
  getMasterAgreementSnapshot,
  LEGAL_CONTENT_VERSION,
} from "../../lib/legal/waivers";

const password = "Synthetic-Phase6!Pass9";
const runId = randomUUID().slice(0, 8);
const serviceId = randomUUID();
const providerProfileId = randomUUID();
const offeringId = randomUUID();
const customerEmail = `phase6-customer-${runId}@example.test`;
const providerEmail = `phase6-provider-${runId}@example.test`;
const adminEmail = `phase6-admin-${runId}@example.test`;

// cancelJob: booked 24h out (full-refund cancel). disputeJob: invoice_review.
const cancelJob = randomUUID();
const disputeJob = randomUUID();

const admin = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

let customerId: string;
let providerUserId: string;
let adminId: string;

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

function baseBooking(id: string, status: BookingStatus, scheduledAt: Date) {
  const now = Date.now();
  const sched = scheduledAt.getTime();
  // Derive timestamps so the persisted-deadline CHECK constraints hold for both
  // a future (booked) and a past (invoice_review) scheduled time:
  //   response_alert_at = created_at + window*1h  and  < scheduled_at
  //   initial_payment_due_at = least(accepted_at + 12h, scheduled_at)
  const createdAt = Math.min(now - 3 * 3_600_000, sched - 2 * 3_600_000);
  const acceptedAt = createdAt + 3_600_000;
  const responseAlertAt = createdAt + 1 * 3_600_000; // window = 1h
  const initialPaymentDueAt = Math.min(acceptedAt + 12 * 3_600_000, sched);
  return {
    id,
    customer_id: customerId,
    provider_id: providerProfileId,
    service_id: serviceId,
    status,
    scheduled_at: scheduledAt.toISOString(),
    address: "600 Synthetic Street, Chicago, IL",
    details: "Phase 6 fixture",
    price_cents: 5000,
    platform_fee_cents: 250,
    created_at: new Date(createdAt).toISOString(),
    accepted_at: new Date(acceptedAt).toISOString(),
    initial_payment_due_at: new Date(initialPaymentDueAt).toISOString(),
    booking_flow: "hourly_v1" as const,
    estimated_minutes: 120,
    job_zip: "60615",
    hourly_rate_cents_snapshot: 5000,
    platform_fee_bps: 500,
    billing_minimum_minutes: 60,
    billing_increment_minutes: 15,
    cancellation_notice_hours: 12,
    pilot_timezone: "America/Chicago",
    response_window_hours: 1,
    response_alert_at: new Date(responseAlertAt).toISOString(),
    customer_name_snapshot: "Synthetic Customer",
    provider_display_name_snapshot: "E2E Provider Six",
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
  };
}

async function insertFirstHour(id: string) {
  const { error } = await admin.from("booking_payments").insert({
    booking_id: id,
    kind: "first_hour",
    amount_cents: 5000,
    application_fee_cents: 250,
    currency: "usd",
    status: "succeeded",
    idempotency_key: `fh_${id}`,
    stripe_connected_account_id: "acct_e2e_phase6",
    stripe_customer_id: "cus_e2e_phase6",
    stripe_payment_method_id: "pm_e2e_phase6",
    customer_authorization_version: "hourly-v1-saved-method",
    succeeded_at: new Date().toISOString(),
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
  providerUserId = await createUser(providerEmail, "provider", "Provider Six Owner");
  adminId = await createUser(adminEmail, "customer", "Founder Six");
  await admin.from("profiles").update({ role: "admin" }).eq("id", adminId);

  await admin
    .from("profiles")
    .update({
      address_line1: "600 Synthetic Street",
      city: "Chicago",
      state: "IL",
      postal_code: "60615",
    })
    .eq("id", customerId);

  const { error: providerError } = await admin.from("provider_profiles").insert({
    id: providerProfileId,
    user_id: providerUserId,
    display_name: "E2E Provider Six",
    bio: "Synthetic provider six",
    verification_status: "approved",
    stripe_account_id: "acct_e2e_phase6",
    stripe_transfers_active: true,
    stripe_transfers_checked_at: new Date().toISOString(),
    service_zip: "60615",
    minimum_notice_hours: 3,
  });
  if (providerError) throw providerError;

  // Per-day availability: near-24h windows every day (service-role insert).
  const { error: windowsError } = await admin
    .from("provider_availability_windows")
    .insert(
      [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
        provider_id: providerProfileId,
        weekday,
        start_local: "00:00",
        end_local: "23:45",
      })),
    );
  if (windowsError) throw windowsError;

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
    acceptMasterAgreement(providerUserId, "provider", "Provider Six Owner"),
  ]);

  // A booked job 24h out to cancel with a full refund.
  const { error: e1 } = await admin
    .from("bookings")
    .insert(baseBooking(cancelJob, "booked", new Date(Date.now() + 24 * 3_600_000)));
  if (e1) throw e1;
  await insertFirstHour(cancelJob);

  // An invoice_review job to dispute, then resolve.
  const { error: e2 } = await admin
    .from("bookings")
    .insert(baseBooking(disputeJob, "invoice_review", new Date(Date.now() - 3 * 3_600_000)));
  if (e2) throw e2;
  await insertFirstHour(disputeJob);
  const { error: invError } = await admin.from("booking_invoices").insert({
    booking_id: disputeJob,
    submitted_minutes: 90,
    estimated_minutes_snapshot: 120,
    hourly_rate_cents_snapshot: 5000,
    platform_fee_bps_snapshot: 500,
    subtotal_cents: 7500,
    total_platform_fee_cents: 375,
    first_hour_credit_cents: 5000,
    remaining_balance_cents: 2500,
    status: "review",
    submitted_at: new Date(Date.now() - 3_600_000).toISOString(),
    autocharge_at: new Date(Date.now() + 23 * 3_600_000).toISOString(),
  });
  if (invError) throw invError;
});

test.afterAll(async () => {
  await admin.from("bookings").delete().eq("customer_id", customerId);
  await admin.from("provider_services").delete().eq("service_id", serviceId);
  await admin.from("services").delete().eq("id", serviceId);
  await admin.from("provider_profiles").delete().eq("id", providerProfileId);
  await Promise.all([
    admin.auth.admin.deleteUser(customerId),
    admin.auth.admin.deleteUser(providerUserId),
    admin.auth.admin.deleteUser(adminId),
  ]);
});

test("customer cancels a booked job >12h out with a full refund", async ({
  page,
}) => {
  await login(page, customerEmail);
  await page.goto("/dashboard");

  const card = page.locator(`[data-booking-id="${cancelJob}"]`);
  await expect(card.getByText("You’ll be fully refunded.")).toBeVisible();
  await card.getByRole("button", { name: "Cancel booking" }).click();

  await expect.poll(() => bookingStatus(cancelJob)).toBe("cancelled");

  // A full-refund cancellation records exactly one first-hour refund request.
  const { data: refunds } = await admin
    .from("booking_refunds")
    .select("amount_cents, status")
    .eq("booking_id", cancelJob);
  expect(refunds).toHaveLength(1);
  expect(refunds![0].amount_cents).toBe(5000);
});

test("customer disputes an invoice, and a founder resolves it", async ({
  browser,
}) => {
  const customerContext = await browser.newContext();
  const customerPage = await customerContext.newPage();
  await login(customerPage, customerEmail);

  await customerPage.goto(`/bookings/${disputeJob}/dispute`);
  await customerPage
    .getByText("The work wasn’t done as agreed")
    .click();
  await customerPage
    .locator("#narrative")
    .fill("The job was left unfinished and needs a founder to review it.");
  await customerPage.getByRole("button", { name: "Submit for review" }).click();

  // The precharge dispute freezes the booking and clears the autocharge.
  await expect.poll(() => bookingStatus(disputeJob)).toBe("disputed");
  const { data: invAfter } = await admin
    .from("booking_invoices")
    .select("autocharge_at")
    .eq("booking_id", disputeJob)
    .single();
  expect(invAfter!.autocharge_at).toBeNull();

  // Founder resolves by waiving the balance → the booking completes.
  const adminContext = await browser.newContext();
  const adminPage = await adminContext.newPage();
  await login(adminPage, adminEmail);
  await adminPage.goto(`/admin/bookings/${disputeJob}`);
  await adminPage.getByText("Waive the remaining balance").click();
  await adminPage
    .locator("#auditNote")
    .fill("Provider agreed to waive the remainder after review.");
  await adminPage.getByRole("button", { name: "Apply resolution" }).click();

  await expect.poll(() => bookingStatus(disputeJob)).toBe("completed");
  const { data: disputeRow } = await admin
    .from("booking_disputes")
    .select("status, resolution_kind")
    .eq("booking_id", disputeJob)
    .single();
  expect(disputeRow!.status).toBe("resolved");
  expect(disputeRow!.resolution_kind).toBe("waive_remaining_balance");

  await customerContext.close();
  await adminContext.close();
});
