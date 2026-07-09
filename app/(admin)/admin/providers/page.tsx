import type { Metadata } from "next";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { RealtimeRefresh } from "@/components/realtime-refresh";
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

  // Verified school (.edu) emails, keyed by user (no direct FK to join on).
  const { data: schoolRows } = await supabase
    .from("provider_school_emails")
    .select("user_id, email");
  const schoolByUser = new Map(
    (schoolRows ?? []).map((r) => [r.user_id, r.email]),
  );

  const providers = (data ?? []) as Row[];
  // Ready for review only once BOTH student proofs are in: verified .edu +
  // driver's license (front and back).
  const queue = providers.filter(
    (p) =>
      p.verification_status === "pending" &&
      p.id_document_url &&
      p.id_document_back_url &&
      schoolByUser.has(p.user_id),
  );
  const rest = providers.filter((p) => !queue.includes(p));

  const queueWithDocs = await Promise.all(
    queue.map(async (provider) => ({
      provider,
      frontUrl: await idDocumentUrl(provider.id_document_url),
      backUrl: await idDocumentUrl(provider.id_document_back_url),
    })),
  );

  return (
    <div className="space-y-8">
      {/* New signups, ID uploads, and school-email verifications all move the
          review queue — listen to both tables that feed it. */}
      <RealtimeRefresh channel="admin-providers" table="provider_profiles" />
      <RealtimeRefresh
        channel="admin-school-emails"
        table="provider_school_emails"
      />
      <PageHeader
        title="Provider approvals"
        description="Review driver's licenses by hand. Approving flips the provider live in Browse and unlocks their Stripe connection."
      />

      {err === "env" ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          SUPABASE_SERVICE_ROLE_KEY is missing — approvals need it. Add it to
          .env.local.
        </div>
      ) : null}

      {err === "unverified" ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          That provider hasn&apos;t verified a school (.edu) email yet — they
          can&apos;t be approved until they do.
        </div>
      ) : null}

      <section aria-labelledby="queue">
        <h2
          id="queue"
          className="font-display text-xl font-semibold"
        >
          Review queue ({queueWithDocs.length})
        </h2>
        <div className="mt-3 space-y-3">
          {queueWithDocs.length === 0 ? (
            <EmptyState title="Queue is clear">
              New providers appear here once they upload their driver&apos;s
              license.
            </EmptyState>
          ) : (
            queueWithDocs.map(({ provider, frontUrl, backUrl }) => (
              <Card key={provider.id} pennant className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-display text-lg font-semibold">
                      {provider.display_name || "Unnamed provider"}
                    </p>
                    <p className="mt-0.5 text-sm text-ink-soft">
                      {provider.user?.full_name} · signed up{" "}
                      {formatDate(provider.created_at)} ·{" "}
                      {provider.provider_services.length} service
                      {provider.provider_services.length === 1 ? "" : "s"}
                    </p>
                    <p className="mt-0.5 text-sm text-quad-700">
                      School email: {schoolByUser.get(provider.user_id)} ✓
                    </p>
                  </div>
                  <Badge tone="gold">Pending review</Badge>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-4">
                  {frontUrl || backUrl ? (
                    <>
                      {frontUrl ? (
                        <a
                          href={frontUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-sm font-semibold text-crew-700 underline"
                        >
                          View license front ↗
                        </a>
                      ) : null}
                      {backUrl ? (
                        <a
                          href={backUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-sm font-semibold text-crew-700 underline"
                        >
                          View license back ↗
                        </a>
                      ) : null}
                    </>
                  ) : (
                    <span className="text-sm text-mist">
                      License uploaded (add the service-role key to view it)
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
          className="font-display text-xl font-semibold"
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
                  {!provider.id_document_url || !provider.id_document_back_url ? (
                    <span className="ml-2 text-xs text-mist">
                      {!provider.id_document_url && !provider.id_document_back_url
                        ? "(no license uploaded yet)"
                        : "(license incomplete — one side missing)"}
                    </span>
                  ) : null}
                  {provider.verification_status === "pending" &&
                  !schoolByUser.has(provider.user_id) ? (
                    <span className="ml-2 text-xs text-mist">
                      (school email not verified)
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
