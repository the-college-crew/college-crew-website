import type { Metadata } from "next";
import Link from "next/link";

import { updateSupportTicketStatus } from "./actions";
import { RealtimeRefresh } from "@/components/realtime-refresh";
import { Badge } from "@/components/ui/badge";
import { buttonClasses, Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/field";
import type {
  SupportTicket,
  SupportTicketCategory,
  SupportTicketSentiment,
  SupportTicketStatus,
  UserRole,
} from "@/lib/db/types";
import {
  SUPPORT_CATEGORIES,
  SUPPORT_CATEGORY_LABELS,
  SUPPORT_SENTIMENT_LABELS,
  SUPPORT_SENTIMENTS,
  SUPPORT_STATUS_LABELS,
} from "@/lib/support/tickets";
import { createClient } from "@/lib/supabase/server";
import { cn, formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Support inbox" };

const PAGE_SIZE = 25;
const STATUSES = ["new", "reviewing", "resolved"] as const;
const CATEGORIES = SUPPORT_CATEGORIES.map((item) => item.value);
const SENTIMENTS = SUPPORT_SENTIMENTS.map((item) => item.value);

type TicketRow = SupportTicket & {
  submitter: { full_name: string; role: UserRole } | null;
};

function oneOf<T extends string>(
  value: string | undefined,
  values: readonly T[],
): T | undefined {
  return values.includes(value as T) ? (value as T) : undefined;
}

function pageNumber(value: string | undefined) {
  const parsed = Number.parseInt(value ?? "1", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function queryHref({
  status,
  category,
  sentiment,
  page,
}: {
  status?: SupportTicketStatus | "all";
  category?: SupportTicketCategory;
  sentiment?: SupportTicketSentiment;
  page?: number;
}) {
  const params = new URLSearchParams();
  if (status && status !== "new") params.set("status", status);
  if (category) params.set("category", category);
  if (sentiment) params.set("sentiment", sentiment);
  if (page && page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `/admin/support?${query}` : "/admin/support";
}

const statusTone = {
  new: "gold",
  reviewing: "blue",
  resolved: "green",
} as const;

const sentimentTone = {
  positive: "green",
  neutral: "gray",
  frustrated: "red",
} as const;

export default async function AdminSupportPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    category?: string;
    sentiment?: string;
    page?: string;
    err?: string;
  }>;
}) {
  const params = await searchParams;
  const status =
    params.status === "all"
      ? "all"
      : (oneOf(params.status, STATUSES) ?? "new");
  const category = oneOf(params.category, CATEGORIES);
  const sentiment = oneOf(params.sentiment, SENTIMENTS);
  const page = pageNumber(params.page);

  const supabase = await createClient();
  let query = supabase
    .from("support_tickets")
    .select(
      "*, submitter:profiles!support_tickets_submitter_id_fkey(full_name, role)",
      { count: "exact" },
    )
    .order("created_at", { ascending: false });

  if (status !== "all") query = query.eq("status", status);
  if (category) query = query.eq("category", category);
  if (sentiment) query = query.eq("sentiment", sentiment);

  const from = (page - 1) * PAGE_SIZE;
  const { data, count, error } = await query.range(
    from,
    from + PAGE_SIZE - 1,
  );
  const tickets = (data ?? []) as unknown as TicketRow[];
  const total = count ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const sharedFilters = { category, sentiment };

  return (
    <div className="space-y-7">
      <RealtimeRefresh channel="admin-support" table="support_tickets" />
      <PageHeader
        title="Support inbox"
        description="Review website feedback, feature ideas, and customer or provider support requests."
      />

      {params.err === "env" ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          SUPABASE_SERVICE_ROLE_KEY is missing — ticket updates need it. Add it
          to .env.local.
        </div>
      ) : null}

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          The support inbox could not be loaded: {error.message}
        </div>
      ) : null}

      <nav
        aria-label="Ticket status"
        className="flex flex-wrap gap-2 border-b border-line pb-4"
      >
        {(["new", "reviewing", "resolved", "all"] as const).map((item) => (
          <Link
            key={item}
            href={queryHref({ status: item, ...sharedFilters })}
            aria-current={status === item ? "page" : undefined}
            className={cn(
              "rounded-full px-4 py-2 text-sm font-semibold transition-colors",
              status === item
                ? "bg-viridian text-shell"
                : "border border-stone bg-paper text-ink-soft hover:border-viridian/40",
            )}
          >
            {item === "all" ? "All" : SUPPORT_STATUS_LABELS[item]}
          </Link>
        ))}
      </nav>

      <form
        method="get"
        className="grid gap-3 rounded-2xl border border-stone bg-paper p-4 sm:grid-cols-[1fr_1fr_auto]"
      >
        {status !== "new" ? (
          <input type="hidden" name="status" value={status} />
        ) : null}
        <div>
          <label
            htmlFor="ticket-category"
            className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.1em] text-mist"
          >
            Topic
          </label>
          <Select
            id="ticket-category"
            name="category"
            defaultValue={category ?? ""}
          >
            <option value="">All topics</option>
            {SUPPORT_CATEGORIES.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <label
            htmlFor="ticket-sentiment"
            className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.1em] text-mist"
          >
            Sentiment
          </label>
          <Select
            id="ticket-sentiment"
            name="sentiment"
            defaultValue={sentiment ?? ""}
          >
            <option value="">All sentiment</option>
            {SUPPORT_SENTIMENTS.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex items-end gap-2">
          <Button type="submit">Apply</Button>
          <Link
            href={queryHref({ status })}
            className={buttonClasses({ variant: "ghost" })}
          >
            Clear
          </Link>
        </div>
      </form>

      <section aria-labelledby="ticket-results">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2
            id="ticket-results"
            className="font-display text-xl font-semibold text-viridian"
          >
            {status === "all" ? "All tickets" : SUPPORT_STATUS_LABELS[status]}
          </h2>
          <p className="text-sm text-mist">
            {total} {total === 1 ? "ticket" : "tickets"}
          </p>
        </div>

        <div className="mt-3 space-y-3">
          {tickets.length === 0 ? (
            <EmptyState title="No tickets match these filters">
              New submissions will appear here automatically.
            </EmptyState>
          ) : (
            tickets.map((ticket) => {
              const submitterName =
                ticket.submitter?.full_name?.trim() || "Guest";
              const excerpt =
                ticket.message.length > 170
                  ? `${ticket.message.slice(0, 170)}…`
                  : ticket.message;

              return (
                <Card
                  key={ticket.id}
                  pennant={ticket.category === "safety_or_trust"}
                  className="overflow-hidden"
                >
                  <details className="group">
                    <summary className="cursor-pointer list-none p-4 [&::-webkit-details-marker]:hidden">
                      <div className="flex items-start gap-3">
                        <span
                          aria-hidden
                          className="mt-1 shrink-0 text-mist transition-transform group-open:rotate-90"
                        >
                          ▸
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge
                              tone={
                                ticket.category === "safety_or_trust"
                                  ? "red"
                                  : "blue"
                              }
                            >
                              {SUPPORT_CATEGORY_LABELS[ticket.category]}
                            </Badge>
                            <Badge tone={statusTone[ticket.status]}>
                              {SUPPORT_STATUS_LABELS[ticket.status]}
                            </Badge>
                            {ticket.sentiment ? (
                              <Badge tone={sentimentTone[ticket.sentiment]}>
                                {SUPPORT_SENTIMENT_LABELS[ticket.sentiment]}
                              </Badge>
                            ) : null}
                            {ticket.wants_reply ? (
                              <Badge tone="gold">Reply requested</Badge>
                            ) : null}
                          </div>
                          <p className="mt-3 text-sm leading-relaxed text-ink">
                            {excerpt}
                          </p>
                          <p className="mt-2 text-xs text-mist">
                            {submitterName}
                            {ticket.submitter
                              ? ` · ${ticket.submitter.role}`
                              : " · anonymous"}
                            {" · "}
                            {formatDateTime(ticket.created_at)}
                          </p>
                        </div>
                      </div>
                    </summary>

                    <div className="border-t border-line px-4 py-5 sm:px-8">
                      <dl className="grid gap-3 text-sm sm:grid-cols-2">
                        <div>
                          <dt className="text-xs font-semibold uppercase tracking-[0.1em] text-mist">
                            Submitted by
                          </dt>
                          <dd className="mt-1 font-medium">{submitterName}</dd>
                        </div>
                        <div>
                          <dt className="text-xs font-semibold uppercase tracking-[0.1em] text-mist">
                            Source page
                          </dt>
                          <dd className="mt-1 break-all font-mono text-xs">
                            {ticket.source_path ?? "Not captured"}
                          </dd>
                        </div>
                        {ticket.wants_reply ? (
                          <div className="sm:col-span-2">
                            <dt className="text-xs font-semibold uppercase tracking-[0.1em] text-mist">
                              Reply email
                            </dt>
                            <dd className="mt-1 break-all font-medium">
                              {ticket.contact_email}
                            </dd>
                          </div>
                        ) : null}
                      </dl>

                      <div className="mt-5 rounded-xl bg-shell p-4">
                        <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink">
                          {ticket.message}
                        </p>
                      </div>

                      <div className="mt-5 flex flex-wrap gap-2">
                        {ticket.status === "new" ? (
                          <StatusButton
                            ticketId={ticket.id}
                            status="reviewing"
                            label="Mark reviewing"
                          />
                        ) : null}
                        {ticket.status !== "resolved" ? (
                          <StatusButton
                            ticketId={ticket.id}
                            status="resolved"
                            label="Resolve"
                            variant="success"
                          />
                        ) : (
                          <StatusButton
                            ticketId={ticket.id}
                            status="reviewing"
                            label="Reopen"
                            variant="secondary"
                          />
                        )}
                      </div>
                    </div>
                  </details>
                </Card>
              );
            })
          )}
        </div>
      </section>

      {pageCount > 1 ? (
        <nav
          aria-label="Support inbox pages"
          className="flex items-center justify-between border-t border-line pt-4"
        >
          {page > 1 ? (
            <Link
              href={queryHref({
                status,
                category,
                sentiment,
                page: page - 1,
              })}
              className={buttonClasses({ variant: "secondary" })}
            >
              Previous
            </Link>
          ) : (
            <span />
          )}
          <span className="text-sm text-mist">
            Page {Math.min(page, pageCount)} of {pageCount}
          </span>
          {page < pageCount ? (
            <Link
              href={queryHref({
                status,
                category,
                sentiment,
                page: page + 1,
              })}
              className={buttonClasses({ variant: "secondary" })}
            >
              Next
            </Link>
          ) : (
            <span />
          )}
        </nav>
      ) : null}
    </div>
  );
}

function StatusButton({
  ticketId,
  status,
  label,
  variant = "secondary",
}: {
  ticketId: string;
  status: SupportTicketStatus;
  label: string;
  variant?: "secondary" | "success";
}) {
  return (
    <form action={updateSupportTicketStatus}>
      <input type="hidden" name="ticketId" value={ticketId} />
      <input type="hidden" name="status" value={status} />
      <Button type="submit" variant={variant} size="sm">
        {label}
      </Button>
    </form>
  );
}

