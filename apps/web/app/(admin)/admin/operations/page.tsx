import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { requireRole } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatDateTime } from "@/lib/utils";

import {
  retryAutomationJob,
  retryBookingRefund,
  retryOutboxEmail,
  retryStripeWebhook,
} from "./actions";

export const metadata: Metadata = { title: "Booking operations" };

export default async function AdminOperationsPage() {
  await requireRole("admin");
  const admin = createAdminClient();
  const webhookAttentionDate = new Date();
  webhookAttentionDate.setMinutes(webhookAttentionDate.getMinutes() - 5);
  const webhookAttentionBefore = webhookAttentionDate.toISOString();
  const [
    jobsResult,
    emailFailureResult,
    deliveryIssueResult,
    otherDeliveryIssueResult,
    refundsResult,
    webhooksResult,
  ] = await Promise.all([
    admin
      .from("booking_automation_jobs")
      .select("id, kind, booking_id, attempt_count, last_error_class, last_error_at, terminal_at")
      .eq("status", "failed")
      .order("terminal_at", { ascending: false })
      .limit(100),
    admin
      .from("email_outbox")
      .select(
        "id, template, booking_id, status, attempt_count, last_error, last_error_class, last_error_at, terminal_at, delivery_status, delivery_event_at, delivery_detail",
      )
      .eq("status", "failed")
      .not("terminal_at", "is", null)
      .order("terminal_at", { ascending: false })
      .limit(100),
    admin
      .from("email_outbox")
      .select(
        "id, template, booking_id, status, attempt_count, last_error, last_error_class, last_error_at, terminal_at, delivery_status, delivery_event_at, delivery_detail",
      )
      .in("delivery_status", [
        "delayed",
        "bounced",
        "complained",
        "failed",
        "suppressed",
      ])
      .order("delivery_event_at", { ascending: false })
      .limit(100),
    admin
      .from("resend_webhook_events")
      .select(
        "id, event_type, provider_message_id, recipient_email, event_created_at, detail",
      )
      .eq("is_current", true)
      .is("matched_outbox_id", null)
      .in("delivery_status", [
        "delayed",
        "bounced",
        "complained",
        "failed",
        "suppressed",
      ])
      .order("event_created_at", { ascending: false })
      .limit(100),
    admin
      .from("booking_refunds")
      .select("id, booking_id, failure_code, failed_at")
      .eq("status", "failed")
      .order("failed_at", { ascending: false })
      .limit(100),
    admin
      .from("stripe_webhook_receipts")
      .select("id, event_type, received_at, processing_started_at, attempt_count, last_error")
      .is("processed_at", null)
      .or(
        `last_error.not.is.null,processing_started_at.lte.${webhookAttentionBefore},and(processing_started_at.is.null,received_at.lte.${webhookAttentionBefore})`,
      )
      .order("received_at", { ascending: false })
      .limit(100),
  ]);
  const jobs = jobsResult.data ?? [];
  const emailById = new Map(
    [...(emailFailureResult.data ?? []), ...(deliveryIssueResult.data ?? [])].map(
      (email) => [email.id, email],
    ),
  );
  const emails = [...emailById.values()].sort(
    (left, right) =>
      Date.parse(right.delivery_event_at ?? right.last_error_at ?? right.terminal_at ?? "0") -
      Date.parse(left.delivery_event_at ?? left.last_error_at ?? left.terminal_at ?? "0"),
  );
  const otherDeliveryIssues = otherDeliveryIssueResult.data ?? [];
  const refunds = refundsResult.data ?? [];
  const webhooks = webhooksResult.data ?? [];
  const empty =
    !jobs.length &&
    !emails.length &&
    !otherDeliveryIssues.length &&
    !refunds.length &&
    !webhooks.length;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Booking operations"
        description="Redacted terminal automation failures and unresolved payment infrastructure work. Retrying only releases the existing idempotent record; it does not create a second charge or email event."
      />

      {empty ? (
        <EmptyState title="All systems clear">
          No terminal scheduler, email, refund, or webhook failures need founder attention.
        </EmptyState>
      ) : null}

      <OperationsSection title="Scheduler jobs" count={jobs.length}>
        {jobs.map((job) => (
          <Card key={job.id} className="flex flex-wrap items-center justify-between gap-4 p-4">
            <SafeDetails
              title={job.kind}
              bookingId={job.booking_id}
              detail={`${job.last_error_class ?? "unknown"} · ${job.attempt_count} attempts`}
              at={job.last_error_at ?? job.terminal_at}
            />
            <form action={retryAutomationJob}>
              <input type="hidden" name="jobId" value={job.id} />
              <Button type="submit" size="sm" variant="secondary">Retry job</Button>
            </form>
          </Card>
        ))}
      </OperationsSection>

      <OperationsSection title="Email delivery" count={emails.length}>
        {emails.map((email) => (
          <Card key={email.id} className="flex flex-wrap items-center justify-between gap-4 p-4">
            <SafeDetails
              title={email.template}
              bookingId={email.booking_id}
              detail={
                email.delivery_status &&
                ["delayed", "bounced", "complained", "failed", "suppressed"].includes(
                  email.delivery_status,
                )
                  ? `${email.delivery_status} · ${email.delivery_detail ?? "Resend delivery event"}`
                  : `${email.last_error_class ?? "unknown"} · ${email.attempt_count} attempts · ${email.last_error ?? "No provider detail"}`
              }
              at={email.delivery_event_at ?? email.last_error_at ?? email.terminal_at}
            />
            {email.status === "failed" && email.terminal_at ? (
              <form action={retryOutboxEmail}>
                <input type="hidden" name="outboxId" value={email.id} />
                <Button type="submit" size="sm" variant="secondary">Retry email</Button>
              </form>
            ) : null}
          </Card>
        ))}
      </OperationsSection>

      <OperationsSection title="Other Resend delivery issues" count={otherDeliveryIssues.length}>
        {otherDeliveryIssues.map((event) => (
          <Card key={event.id} className="p-4">
            <SafeDetails
              title={event.event_type}
              bookingId={null}
              detail={`${maskEmail(event.recipient_email)} · message ${event.provider_message_id.slice(0, 8)} · ${event.detail ?? "Resend delivery event"}`}
              at={event.event_created_at}
            />
          </Card>
        ))}
      </OperationsSection>

      <OperationsSection title="Failed refunds" count={refunds.length}>
        {refunds.map((refund) => (
          <Card key={refund.id} className="flex flex-wrap items-center justify-between gap-4 p-4">
            <SafeDetails
              title="Refund requires manual review"
              bookingId={refund.booking_id}
              detail={refund.failure_code ?? "unknown"}
              at={refund.failed_at}
            />
            <form action={retryBookingRefund}>
              <input type="hidden" name="refundId" value={refund.id} />
              <Button type="submit" size="sm" variant="secondary">
                Retry refund
              </Button>
            </form>
          </Card>
        ))}
      </OperationsSection>

      <OperationsSection title="Unprocessed Stripe webhooks" count={webhooks.length}>
        {webhooks.map((webhook) => (
          <Card key={webhook.id} className="flex flex-wrap items-center justify-between gap-4 p-4">
            <SafeDetails
              title={webhook.event_type}
              bookingId={null}
              detail={`${webhook.last_error ?? "stale processing lease"} · ${webhook.attempt_count} attempt${webhook.attempt_count === 1 ? "" : "s"}`}
              at={webhook.processing_started_at ?? webhook.received_at}
            />
            <form action={retryStripeWebhook}>
              <input type="hidden" name="receiptId" value={webhook.id} />
              <Button type="submit" size="sm" variant="secondary">
                Retry webhook
              </Button>
            </form>
          </Card>
        ))}
      </OperationsSection>
    </div>
  );
}

function maskEmail(value: string | null) {
  if (!value) return "recipient unavailable";
  const [local, domain] = value.split("@");
  if (!local || !domain) return "recipient redacted";
  return `${local.slice(0, 1)}***@${domain}`;
}

function OperationsSection({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  if (!count) return null;
  return (
    <section className="space-y-3">
      <h2 className="font-display text-xl font-semibold text-viridian">
        {title} <span className="text-sm font-normal text-mist">({count})</span>
      </h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function SafeDetails({
  title,
  bookingId,
  detail,
  at,
}: {
  title: string;
  bookingId: string | null;
  detail: string;
  at: string | null;
}) {
  return (
    <div>
      <p className="font-semibold text-ink">{title}</p>
      <p className="mt-1 text-sm text-ink-soft">
        {bookingId ? (
          <Link href={`/admin/bookings/${bookingId}`} className="underline">
            Booking {bookingId.slice(0, 8)}
          </Link>
        ) : (
          "Platform event"
        )}
        {` · ${detail}`}
      </p>
      {at ? <p className="mt-1 text-xs text-mist">{formatDateTime(at)}</p> : null}
    </div>
  );
}
