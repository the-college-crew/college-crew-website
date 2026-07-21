"use server";

import { revalidatePath } from "next/cache";
import type Stripe from "stripe";
import { z } from "zod";

import { requireRole } from "@/lib/auth/session";
import { executePendingRefunds } from "@/lib/booking/refunds";
import { hasServiceRoleEnv } from "@/lib/env";
import { getStripe } from "@/lib/stripe/server";
import {
  processStripeWebhookEvent,
  stripeWebhookFailureCode,
} from "@/lib/stripe/webhook-events";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const idSchema = z.string().uuid();

export async function retryAutomationJob(formData: FormData) {
  await requireRole("admin");
  const jobId = idSchema.parse(formData.get("jobId"));
  const supabase = await createClient();
  const result = await supabase.rpc("admin_retry_booking_automation_job", {
    p_job_id: jobId,
  });
  if (result.error || !result.data) throw new Error("Could not retry automation job.");
  revalidatePath("/admin/operations");
}

export async function retryOutboxEmail(formData: FormData) {
  await requireRole("admin");
  const outboxId = idSchema.parse(formData.get("outboxId"));
  const supabase = await createClient();
  const result = await supabase.rpc("admin_retry_email_outbox", {
    p_outbox_id: outboxId,
  });
  if (result.error || !result.data) throw new Error("Could not retry email delivery.");
  revalidatePath("/admin/operations");
}

export async function retryBookingRefund(formData: FormData) {
  await requireRole("admin");
  const refundId = idSchema.parse(formData.get("refundId"));
  const supabase = await createClient();
  const result = await supabase.rpc("admin_retry_booking_refund", {
    p_refund_id: refundId,
  });
  if (result.error || !result.data) {
    throw new Error("Could not release the refund for retry.");
  }

  await executePendingRefunds(result.data);
  revalidatePath("/admin/operations");
  revalidatePath(`/admin/bookings/${result.data}`);
}

export async function retryStripeWebhook(formData: FormData) {
  await requireRole("admin");
  const receiptId = idSchema.parse(formData.get("receiptId"));
  const stripe = getStripe();
  if (!stripe || !hasServiceRoleEnv()) {
    throw new Error("Stripe is not configured for webhook replay.");
  }

  const supabase = await createClient();
  const claim = await supabase.rpc("claim_stripe_webhook_receipt", {
    p_receipt_id: receiptId,
    p_stale_seconds: 300,
  });
  const receipt = claim.data?.[0];
  if (claim.error || !receipt) {
    throw new Error("That webhook is already processed or currently in flight.");
  }

  const admin = createAdminClient();
  const event = receipt.payload as unknown as Stripe.Event;
  if (event.id !== receipt.stripe_event_id) {
    await admin
      .from("stripe_webhook_receipts")
      .update({ last_error: "stripe_webhook_receipt_mismatch" })
      .eq("id", receiptId);
    throw new Error("The stored webhook receipt is invalid.");
  }

  try {
    await processStripeWebhookEvent(admin, stripe, event);
  } catch (error) {
    await admin
      .from("stripe_webhook_receipts")
      .update({ last_error: stripeWebhookFailureCode(error) })
      .eq("id", receiptId);
    throw new Error("Webhook replay failed.");
  }

  await admin
    .from("stripe_webhook_receipts")
    .update({ processed_at: new Date().toISOString(), last_error: null })
    .eq("id", receiptId);
  revalidatePath("/admin/operations");
}
