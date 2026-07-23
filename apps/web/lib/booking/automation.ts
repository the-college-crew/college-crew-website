import "server-only";

import type { Json } from "@/lib/db/types";
import { sendBookingEmail } from "@/lib/email/booking";
import { attemptDueInvoiceCharge } from "@/lib/booking/invoicing";
import { createAdminClient } from "@/lib/supabase/admin";

const JOB_BATCH_SIZE = 20;
const EMAIL_BATCH_SIZE = 20;
const LEASE_SECONDS = 120;
const MAX_ATTEMPTS = 8;

type Counters = {
  claimed: number;
  succeeded: number;
  retried: number;
  failed: number;
};

export type SchedulerSummary = {
  jobs: Counters;
  email: Counters;
};

function retryDelaySeconds(attempt: number) {
  return Math.min(3600, 30 * 2 ** Math.max(0, attempt - 1));
}

function safeErrorClass(error: unknown) {
  const controlled = new Set([
    "StripeUnconfigured",
    "UnknownAutomationKind",
    "EmailProviderRejected",
    "LeaseLost",
  ]);
  if (error instanceof Error && controlled.has(error.message)) return error.message;
  if (error instanceof Error && error.name) {
    return error.name.replace(/[^a-zA-Z0-9_.-]/g, "_").slice(0, 100);
  }
  return "unknown_error";
}

function recipientKind(payload: Json): string | undefined {
  if (!payload || Array.isArray(payload) || typeof payload !== "object") return;
  const value = payload.recipient_kind;
  return typeof value === "string" ? value : undefined;
}

async function processJob(kind: string, bookingId: string, sourceId: string) {
  const admin = createAdminClient();
  if (kind === "response_alert") {
    const result = await admin.rpc("mark_hourly_response_alert", {
      p_booking_id: bookingId,
    });
    if (result.error) throw result.error;
    return;
  }
  if (kind === "request_expiration") {
    const result = await admin.rpc("expire_hourly_booking_request", {
      p_booking_id: bookingId,
    });
    if (result.error) throw result.error;
    // Release the first-hour hold so a timed-out request never charges the
    // customer. Idempotent; the payment_intent.canceled webhook reconciles.
    const { releaseFirstHourHold } = await import("@/lib/booking/first-hour-hold");
    await releaseFirstHourHold(bookingId);
    return;
  }
  if (kind === "payment_expiration") {
    const result = await admin.rpc("expire_unpaid_acceptance", {
      p_booking_id: bookingId,
    });
    if (result.error) throw result.error;
    return;
  }
  if (kind === "invoice_autocharge") {
    const outcome = await attemptDueInvoiceCharge(sourceId);
    if (outcome === "unconfigured") throw new Error("StripeUnconfigured");
    return;
  }
  throw new Error("UnknownAutomationKind");
}

function founderOperationsEmails() {
  return (process.env.FOUNDER_OPERATIONS_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim())
    .filter(Boolean);
}

async function enqueueTerminalSchedulerAlert(jobId: string, bookingId: string) {
  const emails = founderOperationsEmails();
  if (!emails.length) return;
  const admin = createAdminClient();
  await admin.from("email_outbox").upsert(
    emails.map((recipientEmail, index) => ({
      event_key: `scheduler_failure_${jobId}_${index}`,
      booking_id: bookingId,
      recipient_email: recipientEmail,
      template: "scheduler_failure_admin",
      payload: { recipient_kind: "admin", job_id: jobId },
    })),
    { onConflict: "event_key", ignoreDuplicates: true },
  );
}

async function drainJobs(): Promise<Counters> {
  const counters: Counters = { claimed: 0, succeeded: 0, retried: 0, failed: 0 };
  const admin = createAdminClient();
  const claim = await admin.rpc("claim_booking_automation_jobs", {
    p_limit: JOB_BATCH_SIZE,
    p_lease_seconds: LEASE_SECONDS,
  });
  if (claim.error) throw claim.error;
  const jobs = claim.data ?? [];
  counters.claimed = jobs.length;

  await Promise.all(
    jobs.map(async (job) => {
      try {
        await processJob(job.kind, job.booking_id, job.source_id);
        const settled = await admin.rpc("complete_booking_automation_job", {
          p_job_id: job.id,
          p_lease_token: job.lease_token,
        });
        if (settled.error || !settled.data) throw settled.error ?? new Error("LeaseLost");
        counters.succeeded += 1;
      } catch (error) {
        const terminal = job.attempt_count >= MAX_ATTEMPTS;
        await admin.rpc("retry_booking_automation_job", {
          p_job_id: job.id,
          p_lease_token: job.lease_token,
          p_error_class: safeErrorClass(error),
          p_retry_after_seconds: retryDelaySeconds(job.attempt_count),
          p_terminal: terminal,
        });
        if (terminal) {
          counters.failed += 1;
          await enqueueTerminalSchedulerAlert(job.id, job.booking_id);
        } else {
          counters.retried += 1;
        }
      }
    }),
  );
  return counters;
}

async function drainEmail(): Promise<Counters> {
  const counters: Counters = { claimed: 0, succeeded: 0, retried: 0, failed: 0 };
  const admin = createAdminClient();
  const claim = await admin.rpc("claim_email_outbox", {
    p_limit: EMAIL_BATCH_SIZE,
    p_lease_seconds: LEASE_SECONDS,
  });
  if (claim.error) throw claim.error;
  const messages = claim.data ?? [];
  counters.claimed = messages.length;

  await Promise.all(
    messages.map(async (message) => {
      try {
        const booking = message.booking_id
          ? await admin
              .from("bookings")
              .select(
                "customer_name_snapshot, provider_display_name_snapshot, service_name_snapshot, scheduled_at",
              )
              .eq("id", message.booking_id)
              .maybeSingle()
          : null;
        if (booking?.error) throw booking.error;
        const delivery = await sendBookingEmail({
          eventKey: message.event_key,
          template: message.template,
          recipientEmail: message.recipient_email,
          recipientKind: recipientKind(message.payload),
          bookingId: message.booking_id,
          customerName: booking?.data?.customer_name_snapshot ?? null,
          providerName: booking?.data?.provider_display_name_snapshot ?? null,
          serviceName: booking?.data?.service_name_snapshot ?? null,
          scheduledAt: booking?.data?.scheduled_at ?? null,
        });
        if (!delivery.ok) throw new Error("EmailProviderRejected");
        const settled = await admin.rpc("settle_email_outbox", {
          p_outbox_id: message.id,
          p_lease_token: message.lease_token,
          p_provider_message_id: delivery.providerMessageId,
        });
        if (settled.error || !settled.data) throw settled.error ?? new Error("LeaseLost");
        counters.succeeded += 1;
      } catch (error) {
        const terminal = message.attempt_count >= MAX_ATTEMPTS;
        await admin.rpc("retry_email_outbox", {
          p_outbox_id: message.id,
          p_lease_token: message.lease_token,
          p_error_class: safeErrorClass(error),
          p_retry_after_seconds: retryDelaySeconds(message.attempt_count),
          p_terminal: terminal,
        });
        if (terminal) counters.failed += 1;
        else counters.retried += 1;
      }
    }),
  );
  return counters;
}

/** One bounded scheduler cycle. Each category settles independently. */
export async function runBookingScheduler(): Promise<SchedulerSummary> {
  const [jobs, email] = await Promise.all([drainJobs(), drainEmail()]);
  const summary = { jobs, email };
  console.info("[booking-scheduler]", summary);
  return summary;
}
