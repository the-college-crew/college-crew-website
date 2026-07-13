"use client";

import { useMemo, useRef, useState } from "react";

import {
  loadAdminProviderProfile,
  type AdminProviderDetail,
} from "@/app/(admin)/admin/actions";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import type { VerificationStatus } from "@/lib/db/types";
import { cn, formatDate } from "@/lib/utils";

import { ProviderDetailModal } from "./provider-detail-modal";

export type ProviderRow = {
  id: string;
  displayName: string;
  fullName: string | null;
  status: VerificationStatus;
  createdAt: string;
  hasLicense: boolean;
  hasSchoolEmail: boolean;
  serviceCount: number;
  bookingReady: boolean;
  serviceSlugs: string[];
};

export type ServiceOption = { slug: string; name: string };

const TABS: Array<{ key: VerificationStatus; label: string }> = [
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
];

const statusTone = {
  pending: "gold",
  approved: "green",
  rejected: "red",
} as const;

type Stage = "ready" | "needs_id" | "needs_email" | "needs_both";

const STAGE_ORDER: Array<{ key: Stage; label: string; hint: string }> = [
  {
    key: "ready",
    label: "Ready for review",
    hint: "Verified .edu + license (front & back)",
  },
  {
    key: "needs_id",
    label: "Needs driver's license",
    hint: "Has .edu, license not complete",
  },
  {
    key: "needs_email",
    label: "Needs .edu email",
    hint: "Has license, no verified school email",
  },
  {
    key: "needs_both",
    label: "Needs .edu + license",
    hint: "Just getting started",
  },
];

function stageOf(row: ProviderRow): Stage {
  if (row.hasLicense && row.hasSchoolEmail) return "ready";
  if (row.hasSchoolEmail) return "needs_id";
  if (row.hasLicense) return "needs_email";
  return "needs_both";
}

export function ProvidersManager({
  rows,
  serviceOptions,
}: {
  rows: ProviderRow[];
  serviceOptions: ServiceOption[];
}) {
  const [tab, setTab] = useState<VerificationStatus>("pending");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");

  // Modal state — detail is fetched lazily when a provider is opened.
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AdminProviderDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const requestRef = useRef(0);

  // Service + search filters apply within every tab.
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (selected.size > 0 && !r.serviceSlugs.some((s) => selected.has(s))) {
        return false;
      }
      if (q) {
        const hay = `${r.displayName} ${r.fullName ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, selected, search]);

  const counts = useMemo(() => {
    const c: Record<VerificationStatus, number> = {
      pending: 0,
      approved: 0,
      rejected: 0,
    };
    for (const r of filtered) c[r.status] += 1;
    return c;
  }, [filtered]);

  const inTab = filtered.filter((r) => r.status === tab);

  const openProvider = async (id: string) => {
    const reqId = ++requestRef.current;
    setOpenId(id);
    setDetail(null);
    setLoadError(false);
    setLoading(true);
    try {
      const result = await loadAdminProviderProfile(id);
      if (reqId !== requestRef.current) return; // superseded by a newer click
      if (!result) {
        setLoadError(true);
      } else {
        setDetail(result);
      }
    } catch {
      if (reqId === requestRef.current) setLoadError(true);
    } finally {
      if (reqId === requestRef.current) setLoading(false);
    }
  };

  const closeModal = () => {
    requestRef.current += 1; // cancel any in-flight load
    setOpenId(null);
    setDetail(null);
    setLoadError(false);
    setLoading(false);
  };

  const toggleService = (slug: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  };

  return (
    <div className="space-y-5">
      {/* Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-line">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm font-semibold transition-colors",
              tab === t.key
                ? "border-viridian text-viridian"
                : "border-transparent text-mist hover:text-ink-soft",
            )}
          >
            {t.label}{" "}
            <span
              className={cn(
                "ml-0.5 rounded-full px-1.5 py-0.5 text-xs",
                tab === t.key
                  ? "bg-honeydew text-viridian"
                  : "bg-stone text-ink-soft",
              )}
            >
              {counts[t.key]}
            </span>
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name…"
          className="w-full max-w-xs rounded-xl border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-viridian/40"
        />
        {serviceOptions.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-mist">
              Services
            </span>
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                selected.size === 0
                  ? "border-viridian bg-viridian text-shell"
                  : "border-line bg-paper text-ink-soft hover:bg-stone/40",
              )}
            >
              All
            </button>
            {serviceOptions.map((s) => (
              <button
                key={s.slug}
                type="button"
                onClick={() => toggleService(s.slug)}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                  selected.has(s.slug)
                    ? "border-viridian bg-viridian text-shell"
                    : "border-line bg-paper text-ink-soft hover:bg-stone/40",
                )}
              >
                {s.name}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {/* List */}
      {tab === "pending" ? (
        <PendingList rows={inTab} onOpen={openProvider} />
      ) : (
        <FlatList rows={inTab} onOpen={openProvider} emptyTab={tab} />
      )}

      {openId !== null ? (
        <ProviderDetailModal
          loading={loading}
          detail={detail}
          error={loadError}
          onClose={closeModal}
        />
      ) : null}
    </div>
  );
}

function PendingList({
  rows,
  onOpen,
}: {
  rows: ProviderRow[];
  onOpen: (id: string) => void;
}) {
  if (rows.length === 0) {
    return (
      <EmptyState title="No pending providers">
        New providers appear here as they sign up and work through onboarding.
      </EmptyState>
    );
  }

  const byStage = new Map<Stage, ProviderRow[]>();
  for (const r of rows) {
    const s = stageOf(r);
    (byStage.get(s) ?? byStage.set(s, []).get(s)!).push(r);
  }

  return (
    <div className="space-y-6">
      {STAGE_ORDER.map(({ key, label, hint }) => {
        const group = byStage.get(key);
        if (!group || group.length === 0) return null;
        return (
          <section key={key} aria-label={label}>
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <h3 className="font-display text-lg font-semibold">
                {label}{" "}
                <span className="text-sm font-normal text-mist">
                  ({group.length})
                </span>
              </h3>
              <span className="text-xs text-mist">— {hint}</span>
            </div>
            <Card className="mt-2 divide-y divide-line p-0">
              {group.map((r) => (
                <ProviderListRow key={r.id} row={r} onOpen={onOpen} />
              ))}
            </Card>
          </section>
        );
      })}
    </div>
  );
}

function FlatList({
  rows,
  onOpen,
  emptyTab,
}: {
  rows: ProviderRow[];
  onOpen: (id: string) => void;
  emptyTab: VerificationStatus;
}) {
  if (rows.length === 0) {
    return (
      <EmptyState title={`No ${emptyTab} providers`}>
        Nothing here matches the current filters.
      </EmptyState>
    );
  }
  return (
    <Card className="divide-y divide-line p-0">
      {rows.map((r) => (
        <ProviderListRow key={r.id} row={r} onOpen={onOpen} />
      ))}
    </Card>
  );
}

function ProviderListRow({
  row,
  onOpen,
}: {
  row: ProviderRow;
  onOpen: (id: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
      <div className="min-w-0">
        <button
          type="button"
          onClick={() => onOpen(row.id)}
          className="text-left font-semibold text-crew-700 underline-offset-2 hover:underline"
        >
          {row.displayName || row.fullName || "Unnamed provider"}
        </button>
        <p className="mt-0.5 text-xs text-mist">
          {row.fullName ? `${row.fullName} · ` : ""}signed up{" "}
          {formatDate(row.createdAt)} · {row.serviceCount} service
          {row.serviceCount === 1 ? "" : "s"}
        </p>
      </div>
      <div className="flex items-center gap-2">
        {row.status === "approved" ? (
          <Badge tone={row.bookingReady ? "green" : "gold"}>
            {row.bookingReady ? "Booking ready" : "Setup needed"}
          </Badge>
        ) : null}
        <Badge tone={statusTone[row.status]}>{row.status}</Badge>
      </div>
    </div>
  );
}
