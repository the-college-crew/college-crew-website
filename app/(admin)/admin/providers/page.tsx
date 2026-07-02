import type { Metadata } from "next";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import type { ProviderProfile } from "@/lib/db/types";
import { hasServiceRoleEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";

import { approveProvider, rejectProvider } from "../actions";

export const metadata: Metadata = { title: "Provider approvals" };

type Row = ProviderProfile & {
  user: { full_name: string } | null;
  provider_services: Array<{ id: string }>;
};

/** Signed, short-lived link to the private ID document (service role). */
async function idDocumentUrl(path: string | null) {
  if (!path || !hasServiceRoleEnv()) return null;
  const admin = createAdminClient();
  const { data } = await admin.storage
    .from("id-documents")
    .createSignedUrl(path, 60 * 60);
  return data?.signedUrl ?? null;
}

const statusTone = {
  pending: "gold",
  approved: "green",
  rejected: "red",
} as const;

export default async function AdminProvidersPage({
  searchParams,
}: {
  searchParams: Promise<{ err?: string }>;
}) {
  const { err } = await searchParams;

  // Reads run as the signed-in admin — RLS admin policies grant visibility.
  const supabase = await createClient();
  const { data } = await supabase
    .from("provider_profiles")
    .select("*, user:profiles(full_name), provider_services(id)")
    .order("created_at", { ascending: true });

  const providers = (data ?? []) as Row[];
  const queue = providers.filter(
    (p) => p.verification_status === "pending" && p.id_document_url,
  );
  const rest = providers.filter((p) => !queue.includes(p));

  const queueWithDocs = await Promise.all(
    queue.map(async (provider) => ({
      provider,
      docUrl: await idDocumentUrl(provider.id_document_url),
    })),
  );

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Founders"
        title="Provider approvals"
        description="Review student IDs by hand. Approving flips the provider live in Browse and unlocks their Stripe connection."
      />

      {err === "env" ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          SUPABASE_SERVICE_ROLE_KEY is missing — approvals need it. Add it to
          .env.local.
        </div>
      ) : null}

      <section aria-labelledby="queue">
        <h2
          id="queue"
          className="font-display text-xl font-semibold uppercase tracking-wide"
        >
          Review queue ({queueWithDocs.length})
        </h2>
        <div className="mt-3 space-y-3">
          {queueWithDocs.length === 0 ? (
            <EmptyState title="Queue is clear">
              New providers appear here once they upload a student ID.
            </EmptyState>
          ) : (
            queueWithDocs.map(({ provider, docUrl }) => (
              <Card key={provider.id} pennant className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-display text-lg font-semibold uppercase tracking-wide">
                      {provider.display_name || "Unnamed provider"}
                    </p>
                    <p className="mt-0.5 text-sm text-ink-soft">
                      {provider.user?.full_name} · signed up{" "}
                      {formatDate(provider.created_at)} ·{" "}
                      {provider.provider_services.length} service
                      {provider.provider_services.length === 1 ? "" : "s"}
                    </p>
                  </div>
                  <Badge tone="gold">Pending review</Badge>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {docUrl ? (
                    <a
                      href={docUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm font-semibold text-crew-700 underline"
                    >
                      View student ID ↗
                    </a>
                  ) : (
                    <span className="text-sm text-mist">
                      ID uploaded (add the service-role key to view it)
                    </span>
                  )}
                </div>

                <div className="mt-3 flex gap-2">
                  <form action={approveProvider}>
                    <input type="hidden" name="providerId" value={provider.id} />
                    <Button type="submit" variant="success" size="sm">
                      Approve
                    </Button>
                  </form>
                  <form action={rejectProvider}>
                    <input type="hidden" name="providerId" value={provider.id} />
                    <Button type="submit" variant="danger" size="sm">
                      Reject
                    </Button>
                  </form>
                </div>
              </Card>
            ))
          )}
        </div>
      </section>

      <section aria-labelledby="all-providers">
        <h2
          id="all-providers"
          className="font-display text-xl font-semibold uppercase tracking-wide"
        >
          All providers
        </h2>
        <Card className="mt-3 divide-y divide-line p-0">
          {rest.length === 0 ? (
            <p className="p-4 text-sm text-mist">No other providers yet.</p>
          ) : (
            rest.map((provider) => (
              <div
                key={provider.id}
                className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm"
              >
                <span className="font-medium">
                  {provider.display_name || provider.user?.full_name || "—"}
                  {!provider.id_document_url ? (
                    <span className="ml-2 text-xs text-mist">
                      (no ID uploaded yet)
                    </span>
                  ) : null}
                </span>
                <Badge tone={statusTone[provider.verification_status]}>
                  {provider.verification_status}
                </Badge>
              </div>
            ))
          )}
        </Card>
      </section>
    </div>
  );
}
