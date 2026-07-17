import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { requireRole } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatDateTime } from "@/lib/utils";

import { retryAutomationJob, retryOutboxEmail } from "./actions";

export const metadata: Metadata = { title: "Booking operations" };

export default async function AdminOperationsPage() {
  await requireRole("admin");
  const admin = createAdminClient();
  const [jobsResult, emailResult, refundsResult, webhooksResult] = await Promise.all([
    admin
      .from("booking_automation_jobs")
      .select("id, kind, booking_id, attempt_count, last_error_class, last_error_at, terminal_at")
      .eq("status", "failed")
      .order("terminal_at", { ascending: false })
      .limit(100),
    admin
      .from("email_outbox")
      .select("id, template, booking_id, attempt_count, last_error_class, last_error_at, terminal_at")
      .eq("status", "failed")
      .not("terminal_at", "is", null)
      .order("terminal_at", { ascending: false })
      .limit(100),
    admin
      .from("booking_refunds")
      .select("id, booking_id, failure_code, failed_at")
      .eq("status", "failed")
      .order("failed_at", { ascending: false })
      .limit(100),
    admin
      .from("stripe_webhook_receipts")
      .select("id, event_type, received_at, attempt_count")
      .is("processed_at", null)
      .order("received_at", { ascending: false })
      .limit(100),
  ]);
  const jobs = jobsResult.data ?? [];
  const emails = emailResult.data ?? [];
  const refunds = refundsResult.data ?? [];
  const webhooks = webhooksResult.data ?? [];
  const empty = !jobs.length && !emails.length && !refunds.length && !webhooks.length;

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
              detail={`${email.last_error_class ?? "unknown"} · ${email.attempt_count} attempts`}
              at={email.last_error_at ?? email.terminal_at}
            />
            <form action={retryOutboxEmail}>
              <input type="hidden" name="outboxId" value={email.id} />
              <Button type="submit" size="sm" variant="secondary">Retry email</Button>
            </form>
          </Card>
        ))}
      </OperationsSection>

      <OperationsSection title="Failed refunds" count={refunds.length}>
        {refunds.map((refund) => (
          <Card key={refund.id} className="p-4">
            <SafeDetails
              title="Refund requires manual review"
              bookingId={refund.booking_id}
              detail={refund.failure_code ?? "unknown"}
              at={refund.failed_at}
            />
          </Card>
        ))}
      </OperationsSection>

      <OperationsSection title="Unprocessed Stripe webhooks" count={webhooks.length}>
        {webhooks.map((webhook) => (
          <Card key={webhook.id} className="p-4">
            <SafeDetails
              title={webhook.event_type}
              bookingId={null}
              detail={`${webhook.attempt_count} processing attempt${webhook.attempt_count === 1 ? "" : "s"}`}
              at={webhook.received_at}
            />
          </Card>
        ))}
      </OperationsSection>
    </div>
  );
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
