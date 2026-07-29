import { createAdminClient } from "./admin.ts";
import { attemptDueInvoiceCharge } from "./invoicing.ts";
import { attemptProviderPayout } from "./payouts.ts";
import {
  cancelPaymentAuthorization,
  captureFirstHourHold,
  releaseFirstHourHold,
} from "./stripe.ts";
import { sendBookingEmail } from "./email.ts";

/**
 * One bounded scheduler cycle: drain due booking-automation jobs and the
 * durable email outbox. Port of apps/web/lib/booking/automation.ts — the
 * claim/lease/complete RPCs are unchanged and remain the concurrency story
 * (a web-route cycle and a function cycle can even overlap safely during
 * cutover; leases keep them off each other's rows).
 */

const JOB_BATCH_SIZE = 20;
const EMAIL_BATCH_SIZE = 20;
const LEASE_SECONDS = 120;
const MAX_ATTEMPTS = 8;

type Counters = {
  claimed: number;
  succeeded: number;
  retried: number;
  failed: number;
  /** Deliberately parked, not attempted — see `PayoutHeldError`. */
  held: number;
};

/**
 * A job that must stop without succeeding and without consuming a retry.
 * Raised when a payout is reached while its booking has an open dispute.
 */
class PayoutHeldError extends Error {
  constructor() {
    super("PayoutHeld");
    this.name = "PayoutHeldError";
  }
}

export type SchedulerSummary = {
  jobs: Counters;
  email: Counters;
};

type ClaimedJob = {
  id: string;
  kind: string;
  booking_id: string;
  source_id: string;
  lease_token: string;
  attempt_count: number;
};

type ClaimedOutboxItem = {
  id: string;
  event_key: string;
  template: string;
  recipient_email: string;
  booking_id: string | null;
  payload: unknown;
  lease_token: string;
  attempt_count: number;
};

function retryDelaySeconds(attempt: number) {
  return Math.min(3600, 30 * 2 ** Math.max(0, attempt - 1));
}

function safeErrorClass(error: unknown) {
  const controlled = new Set([
    "StripeUnconfigured",
    "UnknownAutomationKind",
    "LeaseLost",
  ]);
  if (error instanceof Error && controlled.has(error.message)) return error.message;
  if (error instanceof Error && error.name) {
    return error.name.replace(/[^a-zA-Z0-9_.-]/g, "_").slice(0, 100);
  }
  return "unknown_error";
}

class EmailDeliveryFailure extends Error {
  constructor(
    readonly errorClass: string,
    readonly safeDetail: string,
  ) {
    super(errorClass);
    this.name = "EmailDeliveryFailure";
  }
}

function safeEmailFailure(error: unknown) {
  if (error instanceof EmailDeliveryFailure) {
    return { errorClass: error.errorClass, detail: error.safeDetail };
  }
  const errorClass = safeErrorClass(error);
  return { errorClass, detail: errorClass };
}

function recipientKind(payload: unknown): string | undefined {
  if (!payload || Array.isArray(payload) || typeof payload !== "object") return;
  const value = (payload as Record<string, unknown>).recipient_kind;
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
  if (kind === "reschedule_provider_reminder") {
    const result = await admin.rpc("send_hourly_chat_reschedule_provider_reminder", {
      p_proposal_id: sourceId,
    });
    if (result.error) throw result.error;
    return;
  }
  if (kind === "request_expiration") {
    const result = await admin.rpc("expire_hourly_booking_request", {
      p_booking_id: bookingId,
    });
    if (result.error) throw result.error;
    const outcome = await releaseFirstHourHold(bookingId);
    if (outcome === "unconfigured") throw new Error("StripeUnconfigured");
    return;
  }
  if (kind === "quote_response_expiration" || kind === "quote_payment_expiration") {
    const result = await admin.rpc("expire_quote_booking_stage", {
      p_booking_id: bookingId,
    });
    if (result.error) throw result.error;
    return;
  }
  if (kind === "capture_upfront") {
    const booking = await admin
      .from("bookings")
      .select("status")
      .eq("id", bookingId)
      .maybeSingle();
    if (booking.error) throw booking.error;
    if (booking.data?.status !== "accepted") return;
    const outcome = await captureFirstHourHold(bookingId);
    if (outcome === "unconfigured") throw new Error("StripeUnconfigured");
    return;
  }
  if (kind === "capture_expiration") {
    const result = await admin.rpc("expire_failed_hourly_capture", {
      p_booking_id: bookingId,
    });
    if (result.error) throw result.error;
    if (result.data === "capture_expired") {
      const outcome = await releaseFirstHourHold(bookingId);
      if (outcome === "unconfigured") throw new Error("StripeUnconfigured");
    }
    return;
  }
  if (kind === "payment_expiration") {
    const result = await admin.rpc("expire_unpaid_acceptance", {
      p_booking_id: bookingId,
    });
    if (result.error) throw result.error;
    return;
  }
  if (kind === "completion_timeout") {
    // 24h after Arrived with no invoice submitted: bill the original estimate.
    // Idempotent and a no-op if the provider already submitted or the booking
    // moved on, so a retry can never double-invoice.
    const quoteResult = await admin.rpc("auto_complete_quote_job", {
      p_booking_id: bookingId,
    });
    if (quoteResult.error) throw quoteResult.error;
    if (!quoteResult.data) {
      const result = await admin.rpc("auto_complete_hourly_job", {
        p_booking_id: bookingId,
      });
      if (result.error) throw result.error;
    }
    return;
  }
  if (kind === "invoice_autocharge") {
    const outcome = await attemptDueInvoiceCharge(sourceId);
    if (outcome === "unconfigured") throw new Error("StripeUnconfigured");
    return;
  }
  if (kind === "provider_payout") {
    // The job is complete: release the student's share of the funds the platform
    // has been holding. Idempotent, so a retry cannot pay twice.
    const outcome = await attemptProviderPayout(bookingId);
    if (outcome === "unconfigured") throw new Error("StripeUnconfigured");
    // A dispute landed while this job was already claimed. Signal the drain loop
    // to block the job instead of completing it: completing would mark it
    // `succeeded` and strand the payout, and a plain throw would burn the retry
    // budget until it went terminal. An admin releases it with
    // `release_provider_payout` once the dispute is settled.
    if (outcome === "held") throw new PayoutHeldError();
    return;
  }
  throw new Error("UnknownAutomationKind");
}

function founderOperationsEmails() {
  return (Deno.env.get("FOUNDER_OPERATIONS_EMAILS") ?? "")
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
  const counters: Counters = { claimed: 0, succeeded: 0, retried: 0, failed: 0, held: 0 };
  const admin = createAdminClient();
  const draftsClaim = await admin.rpc("claim_expired_booking_drafts", {
    p_limit: JOB_BATCH_SIZE,
    p_lease_seconds: LEASE_SECONDS,
  });
  if (draftsClaim.error) throw draftsClaim.error;
  const drafts = (draftsClaim.data ?? []) as Array<{
    draft_id: string;
    stripe_payment_intent_id: string;
    lease_token: string;
    attempt_count: number;
  }>;
  counters.claimed += drafts.length;
  await Promise.all(
    drafts.map(async (draft) => {
      try {
        const cancelled = await cancelPaymentAuthorization(
          draft.stripe_payment_intent_id,
        );
        if (cancelled === "unconfigured") throw new Error("StripeUnconfigured");
        const settled = await admin.rpc("complete_booking_draft_cleanup", {
          p_draft_id: draft.draft_id,
          p_lease_token: draft.lease_token,
        });
        if (settled.error || !settled.data) throw new Error("LeaseLost");
        counters.succeeded += 1;
      } catch (error) {
        const terminal = draft.attempt_count >= MAX_ATTEMPTS;
        await admin.rpc("retry_booking_draft_cleanup", {
          p_draft_id: draft.draft_id,
          p_lease_token: draft.lease_token,
          p_error: safeErrorClass(error),
          p_retry_after_seconds: retryDelaySeconds(draft.attempt_count),
          p_terminal: terminal,
        });
        if (terminal) counters.failed += 1;
        else counters.retried += 1;
      }
    }),
  );
  const claim = await admin.rpc("claim_booking_automation_jobs", {
    p_limit: JOB_BATCH_SIZE,
    p_lease_seconds: LEASE_SECONDS,
  });
  if (claim.error) throw claim.error;
  const jobs = (claim.data ?? []) as ClaimedJob[];
  counters.claimed += jobs.length;

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
        if (error instanceof PayoutHeldError) {
          await admin.rpc("block_booking_automation_job", {
            p_job_id: job.id,
            p_lease_token: job.lease_token,
            p_reason: "dispute_hold",
          });
          counters.held += 1;
          return;
        }
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
  const counters: Counters = { claimed: 0, succeeded: 0, retried: 0, failed: 0, held: 0 };
  const admin = createAdminClient();
  const claim = await admin.rpc("claim_email_outbox", {
    p_limit: EMAIL_BATCH_SIZE,
    p_lease_seconds: LEASE_SECONDS,
  });
  if (claim.error) throw claim.error;
  const messages = (claim.data ?? []) as ClaimedOutboxItem[];
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
        const snapshot = booking?.data as {
          customer_name_snapshot: string | null;
          provider_display_name_snapshot: string | null;
          service_name_snapshot: string | null;
          scheduled_at: string | null;
        } | null;
        const delivery = await sendBookingEmail({
          eventKey: message.event_key,
          template: message.template,
          recipientEmail: message.recipient_email,
          recipientKind: recipientKind(message.payload),
          bookingId: message.booking_id,
          customerName: snapshot?.customer_name_snapshot ?? null,
          providerName: snapshot?.provider_display_name_snapshot ?? null,
          serviceName: snapshot?.service_name_snapshot ?? null,
          scheduledAt: snapshot?.scheduled_at ?? null,
        });
        if (!delivery.ok) {
          throw new EmailDeliveryFailure(delivery.errorClass, delivery.error);
        }
        const settled = await admin.rpc("settle_email_outbox", {
          p_outbox_id: message.id,
          p_lease_token: message.lease_token,
          p_provider_message_id: delivery.providerMessageId,
        });
        if (settled.error || !settled.data) throw settled.error ?? new Error("LeaseLost");
        counters.succeeded += 1;
      } catch (error) {
        const terminal = message.attempt_count >= MAX_ATTEMPTS;
        const failure = safeEmailFailure(error);
        await admin.rpc("retry_email_outbox_detailed", {
          p_outbox_id: message.id,
          p_lease_token: message.lease_token,
          p_error_class: failure.errorClass,
          p_error_detail: failure.detail,
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
