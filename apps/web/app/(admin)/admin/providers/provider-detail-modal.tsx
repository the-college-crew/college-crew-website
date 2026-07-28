"use client";

import { useCallback, useEffect, useState, useTransition } from "react";

import {
  bypassProviderVerification,
  setProviderActivity,
  setProviderForcedInactive,
  setProviderStatus,
} from "@/app/(admin)/admin/actions";
import type { AdminProviderDetail } from "@/app/(admin)/admin/actions";
import { EditableProviderField } from "@/components/admin/editable-provider-field";
import { Rating } from "@/components/provider-card";
import { ProviderReadinessChecklist } from "@/components/provider-readiness-checklist";
import { SchoolIdentity } from "@/components/school-identity";
import { Badge, VerifiedBadge } from "@/components/ui/badge";
import { Button, buttonClasses } from "@/components/ui/button";
import type { VerificationStatus } from "@/lib/db/types";
import { cn, formatDate, formatOfferedPrice } from "@/lib/utils";
import {
  PROVIDER_WEEKDAYS,
  formatAvailabilityWindow,
  groupAvailabilityWindows,
} from "@/lib/provider/setup";

import { AdminAvatarCropEditor } from "./admin-avatar-crop-editor";

const statusTone = {
  pending: "gold",
  approved: "green",
  rejected: "red",
} as const;

const statusLabel: Record<VerificationStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
};

/** Buttons to move to any status other than the current one. */
const STATUS_ACTIONS: Array<{
  status: VerificationStatus;
  label: string;
  variant: "success" | "danger" | "secondary";
}> = [
  { status: "approved", label: "Approve", variant: "success" },
  { status: "rejected", label: "Reject", variant: "danger" },
  { status: "pending", label: "Re-open (pending)", variant: "secondary" },
];

export function ProviderDetailModal({
  loading,
  detail,
  error,
  onClose,
}: {
  loading: boolean;
  detail: AdminProviderDetail | null;
  error: boolean;
  onClose: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [confirmingBypass, setConfirmingBypass] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  const changeStatus = useCallback(
    (providerId: string, status: VerificationStatus) => {
      if (
        (status === "approved" || status === "rejected") &&
        !window.confirm(
          status === "approved"
            ? "Approve this provider? If every readiness check passes, they can appear in Browse."
            : "Reject this provider? They will need to update their verification before approval.",
        )
      ) {
        return;
      }
      startTransition(async () => {
        const fd = new FormData();
        fd.set("providerId", providerId);
        fd.set("status", status);
        // Resolves after revalidating the underlying list; redirects on the
        // env/.edu guards (which close this view anyway).
        await setProviderStatus(fd);
        onClose();
      });
    },
    [onClose],
  );

  const confirmBypass = useCallback(
    (providerId: string) => {
      startTransition(async () => {
        const fd = new FormData();
        fd.set("providerId", providerId);
        await bypassProviderVerification(fd);
        onClose();
      });
    },
    [onClose],
  );

  const changeActivity = useCallback(
    (providerId: string, isActive: boolean) => {
      startTransition(async () => {
        const fd = new FormData();
        fd.set("providerId", providerId);
        fd.set("isActive", String(isActive));
        await setProviderActivity(fd);
        onClose();
      });
    },
    [onClose],
  );

  const changeForcedInactive = useCallback(
    (providerId: string, forcedInactive: boolean) => {
      if (
        forcedInactive &&
        !window.confirm(
          "Force this provider inactive? They will be removed from discovery and cannot reactivate themselves until an admin removes this lock.",
        )
      ) {
        return;
      }
      startTransition(async () => {
        const fd = new FormData();
        fd.set("providerId", providerId);
        fd.set("forcedInactive", String(forcedInactive));
        await setProviderForcedInactive(fd);
        onClose();
      });
    },
    [onClose],
  );

  function closeOnBackdrop(event: React.MouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget) onClose();
  }

  const profile = detail?.profile;
  const availabilityGroups = groupAvailabilityWindows(
    profile?.availability_windows ?? [],
  );

  return (
    <div
      role="presentation"
      onClick={closeOnBackdrop}
      className="fixed inset-0 z-50 overflow-y-auto bg-viridian/40 px-4 py-8 backdrop-blur-sm sm:py-12"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Provider profile"
        className="relative mx-auto max-w-3xl"
      >
        <button
          type="button"
          onClick={onClose}
          className={buttonClasses({
            variant: "ghost",
            size: "sm",
            className:
              "absolute left-4 top-4 z-10 bg-paper/90 shadow-sm shadow-viridian/10 hover:bg-stone/70",
          })}
        >
          ← Close
        </button>

        <article className="pennant overflow-hidden rounded-3xl border border-stone bg-paper shadow-xl shadow-viridian/10">
          {loading ? (
            <div className="px-6 py-24 text-center text-sm text-mist sm:px-8">
              Loading profile…
            </div>
          ) : error || !profile || !detail ? (
            <div className="px-6 py-24 text-center text-sm text-red-700 sm:px-8">
              Couldn&apos;t load this provider. Close and try again.
            </div>
          ) : (
            <>
              {/* Identity */}
              <section className="px-6 pb-6 pt-14 sm:px-8">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="font-display text-3xl font-semibold">
                    <EditableProviderField
                      providerId={profile.id}
                      field="display_name"
                      value={profile.display_name}
                      editing={editing}
                      placeholder="Student provider"
                    />
                  </h1>
                  {profile.verification_status === "approved" ? (
                    <VerifiedBadge />
                  ) : null}
                  <Badge tone={statusTone[profile.verification_status]}>
                    {statusLabel[profile.verification_status]}
                  </Badge>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <Badge
                    tone={
                      profile.provider_type === "business" ? "blue" : "gray"
                    }
                  >
                    {profile.provider_type === "business"
                      ? "Student business"
                      : "Hardworking individual"}
                  </Badge>
                  {profile.neighborhood ? (
                    <span className="text-xs text-mist">
                      {profile.neighborhood}
                    </span>
                  ) : null}
                  <Rating rating={profile.rating} />
                </div>

                <SchoolIdentity
                  name={profile.school_name}
                  domain={profile.school_domain}
                  greekOrganization={profile.greek_organization}
                  className="mt-3"
                />

                {editing || profile.company_name ? (
                  <p className="mt-2 text-sm text-ink-soft">
                    Company name:{" "}
                    <EditableProviderField
                      providerId={profile.id}
                      field="company_name"
                      value={profile.company_name ?? ""}
                      editing={editing}
                      placeholder="None"
                    />
                  </p>
                ) : null}

                <p
                  className={cn(
                    "mt-4 text-sm leading-relaxed text-ink-soft",
                    editing && "min-h-6",
                  )}
                >
                  <EditableProviderField
                    providerId={profile.id}
                    field="bio"
                    value={profile.bio}
                    editing={editing}
                    placeholder="No bio yet"
                  />
                </p>

                <button
                  type="button"
                  onClick={() => setEditing((v) => !v)}
                  className={buttonClasses({
                    variant: editing ? "primary" : "secondary",
                    size: "sm",
                    className: "mt-4",
                  })}
                >
                  {editing ? "Done editing" : "Edit name & bio"}
                </button>
                {editing ? (
                  <p className="mt-2 text-xs text-mist">
                    Double-click the name, company name, or bio to edit. Enter
                    saves, Esc cancels. Changes apply immediately.
                  </p>
                ) : null}
              </section>

              {/* Onboarding / verification meta */}
              <section className="border-t border-line bg-court/40 px-6 py-5 text-sm sm:px-8">
                <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
                  <div className="flex justify-between gap-3 sm:block">
                    <dt className="text-mist">Legal name</dt>
                    <dd className="font-medium">{profile.full_name ?? "—"}</dd>
                  </div>
                  <div className="flex justify-between gap-3 sm:block">
                    <dt className="text-mist">Signed up</dt>
                    <dd className="font-medium">
                      {formatDate(profile.created_at)}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3 sm:block">
                    <dt className="text-mist">School (.edu) email</dt>
                    <dd className="font-medium">
                      {detail.schoolEmail ? (
                        <span className="text-quad-700">
                          {detail.schoolEmail} ✓
                        </span>
                      ) : (
                        <span className="text-mist">Not verified</span>
                      )}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3 sm:block">
                    <dt className="text-mist">Driver&apos;s license</dt>
                    <dd className="font-medium">
                      {!profile.id_document_url &&
                      !profile.id_document_back_url ? (
                        <span className="text-mist">Not uploaded</span>
                      ) : (
                        <span className="flex flex-wrap gap-x-3 gap-y-1">
                          <IdDocLink
                            label="Front"
                            path={profile.id_document_url}
                            url={detail.idDocumentUrl}
                          />
                          <IdDocLink
                            label="Back"
                            path={profile.id_document_back_url}
                            url={detail.idDocumentBackUrl}
                          />
                        </span>
                      )}
                    </dd>
                  </div>
                  {profile.verification_bypassed ? (
                    <div className="flex justify-between gap-3 sm:block">
                      <dt className="text-mist">Verification</dt>
                      <dd className="font-medium text-red-700">
                        Bypassed by admin
                        {profile.verification_bypassed_by_name
                          ? ` (${profile.verification_bypassed_by_name})`
                          : ""}
                        {profile.verification_bypassed_at
                          ? ` on ${formatDate(profile.verification_bypassed_at)}`
                          : ""}
                      </dd>
                    </div>
                  ) : null}
                  <AdminAvatarCropEditor
                    providerId={profile.id}
                    imagePath={profile.avatar_image_path}
                    focalX={profile.avatar_focal_x}
                    focalY={profile.avatar_focal_y}
                  />
                  <div className="flex justify-between gap-3 sm:block">
                    <dt className="text-mist">Service ZIP (private)</dt>
                    <dd className="font-medium">{profile.service_zip ?? "Not set"}</dd>
                  </div>
                  <div className="flex justify-between gap-3 sm:block">
                    <dt className="text-mist">Stripe recipient</dt>
                    <dd className="font-medium">
                      {profile.stripe_transfers_active
                        ? "Transfers active"
                        : profile.stripe_account_id
                          ? "Setup incomplete"
                          : "Not connected"}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3 sm:block">
                    <dt className="text-mist">Provider agreement</dt>
                    <dd className="font-medium">
                      {detail.hasCurrentLegalAcceptance ? (
                        <span className="text-quad-700">
                          Version {detail.legalContentVersion} accepted ✓
                        </span>
                      ) : (
                        <span className="text-gold-700">
                          Version {detail.legalContentVersion} required
                        </span>
                      )}
                    </dd>
                  </div>
                </dl>
              </section>

              <section className="border-t border-line px-6 py-5 sm:px-8">
                <ProviderReadinessChecklist
                  profile={profile}
                  windows={profile.availability_windows}
                  legalAcceptance={{
                    ready: detail.hasCurrentLegalAcceptance,
                    version: detail.legalContentVersion,
                  }}
                  offerings={profile.services.map((offering) => ({
                    id: offering.id,
                    name: offering.service.name,
                    hourly_rate_cents: offering.hourly_rate_cents,
                    pricing_mode: offering.pricing_mode,
                    average_quote_cents: offering.average_quote_cents,
                    service_slug: offering.service.slug,
                    service_is_live: offering.service.is_live,
                  }))}
                />
              </section>

              {/* Status actions */}
              <section className="border-t border-line px-6 py-5 sm:px-8">
                <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-mist">
                  Set status
                </h2>
                <div className="mt-3 flex flex-wrap gap-2">
                  {STATUS_ACTIONS.filter(
                    (a) => a.status !== profile.verification_status,
                  ).map((a) => (
                    <Button
                      key={a.status}
                      variant={a.variant}
                      size="sm"
                      disabled={pending}
                      onClick={() => changeStatus(profile.id, a.status)}
                    >
                      {a.label}
                    </Button>
                  ))}
                </div>

                {profile.verification_status !== "approved" ? (
                  <div className="mt-4 border-t border-line pt-4">
                    {!confirmingBypass ? (
                      <Button
                        variant="danger"
                        size="sm"
                        disabled={pending}
                        onClick={() => setConfirmingBypass(true)}
                      >
                        Bypass verification
                      </Button>
                    ) : (
                      <div className="rounded-xl border border-red-200 bg-red-50 p-4">
                        <p className="text-sm font-medium text-red-800">
                          This skips ID document and .edu email verification
                          for this provider. They will still be shown as
                          &ldquo;✓ Verified student&rdquo; on the site. Only
                          use this if you&apos;ve personally confirmed
                          they&apos;re a real student.
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Button
                            variant="danger"
                            size="sm"
                            disabled={pending}
                            onClick={() => confirmBypass(profile.id)}
                          >
                            Confirm bypass
                          </Button>
                          <Button
                            variant="secondary"
                            size="sm"
                            disabled={pending}
                            onClick={() => setConfirmingBypass(false)}
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                ) : null}
              </section>

              <section className="border-t border-line px-6 py-5 sm:px-8">
                <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-mist">
                  Listing availability
                </h2>
                <div className="mt-3 rounded-xl border border-line bg-court/40 p-4 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-medium text-ink">
                        Provider setting: {profile.is_active ? "Active" : "Paused"}
                      </p>
                      <p className="mt-1 text-ink-soft">
                        {profile.is_active
                          ? "They can be discovered and receive new requests unless the admin lock is on."
                          : "They are hidden from discovery, but can reactivate their listing themselves."}
                      </p>
                    </div>
                    <Button
                      variant={profile.is_active ? "secondary" : "success"}
                      size="sm"
                      disabled={pending}
                      onClick={() => changeActivity(profile.id, !profile.is_active)}
                    >
                      {profile.is_active ? "Pause listing" : "Activate listing"}
                    </Button>
                  </div>
                </div>

                <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-medium text-red-900">
                        Founder lock: {profile.admin_forced_inactive ? "Forced inactive" : "Off"}
                      </p>
                      <p className="mt-1 text-red-800">
                        {profile.admin_forced_inactive
                          ? "This provider cannot reactivate their listing until an admin removes the lock."
                          : "Use only when College Crew must keep a provider inactive regardless of their setting."}
                      </p>
                    </div>
                    <Button
                      variant={profile.admin_forced_inactive ? "secondary" : "danger"}
                      size="sm"
                      disabled={pending}
                      onClick={() =>
                        changeForcedInactive(profile.id, !profile.admin_forced_inactive)
                      }
                    >
                      {profile.admin_forced_inactive
                        ? "Remove inactive lock"
                        : "Force inactive"}
                    </Button>
                  </div>
                </div>
              </section>

              {/* Services & pricing */}
              <section className="border-t border-line px-6 py-6 sm:px-8">
                <h2 className="font-display text-2xl font-semibold">
                  Services &amp; pricing
                </h2>
                {profile.services.length === 0 ? (
                  <p className="mt-3 text-sm text-mist">
                    No services added yet.
                  </p>
                ) : (
                  <ul className="mt-4 divide-y divide-line">
                    {profile.services.map((offered) => (
                      <li
                        key={offered.id}
                        className="flex items-center justify-between gap-4 py-3 text-sm"
                      >
                        <span className="font-medium text-ink">
                          {offered.service.name}
                          {!offered.service.is_live ? (
                            <span className="ml-2 text-xs text-mist">
                              (service retired)
                            </span>
                          ) : null}
                        </span>
                        <span className="shrink-0 font-semibold text-quad-700">
                          {formatOfferedPrice(offered)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {/* Availability */}
              <section className="border-t border-line px-6 py-6 sm:px-8">
                <h2 className="font-display text-2xl font-semibold">
                  Availability
                </h2>
                {availabilityGroups.length === 0 && !profile.availability_note ? (
                  <p className="mt-3 text-sm text-mist">
                    No availability set.
                  </p>
                ) : (
                  <>
                    {availabilityGroups.map((group) => (
                      <div
                        key={`${group.start}-${group.end}`}
                        className="mt-3 flex flex-wrap items-center gap-2"
                      >
                        <ul className="flex flex-wrap gap-2">
                          {group.weekdays.map((day) => (
                            <li
                              key={day}
                              className="rounded-full border border-quad-200 bg-quad-50 px-3 py-1 text-xs font-semibold text-quad-800"
                            >
                              {PROVIDER_WEEKDAYS.find(({ value }) => value === day)
                                ?.short ?? day}
                            </li>
                          ))}
                        </ul>
                        <span className="text-sm font-medium text-ink-soft">
                          {formatAvailabilityWindow(group.start, group.end)}
                        </span>
                      </div>
                    ))}
                    {profile.availability_note ? (
                      <p className="mt-3 text-sm text-ink-soft">
                        {profile.availability_note}
                      </p>
                    ) : null}
                    <p className="mt-2 text-xs text-mist">
                      {profile.minimum_notice_hours} hours minimum notice
                    </p>
                  </>
                )}
              </section>

              {/* Reviews */}
              <section className="border-t border-line px-6 py-6 sm:px-8">
                <h2 className="font-display text-2xl font-semibold">Reviews</h2>
                {profile.reviews.length === 0 ? (
                  <p className="mt-3 text-sm text-mist">No reviews yet.</p>
                ) : (
                  <ul className="mt-4 space-y-4">
                    {profile.reviews.map((review) => (
                      <li
                        key={review.id}
                        className="border-b border-line pb-4 last:border-0"
                      >
                        <div className="flex items-center gap-2 text-sm">
                          <span
                            aria-label={`${review.rating} out of 5 stars`}
                            className="text-gold-700"
                          >
                            {"★".repeat(review.rating)}
                            <span className="text-line">
                              {"★".repeat(5 - review.rating)}
                            </span>
                          </span>
                          {review.service_name ? (
                            <span className="text-xs text-mist">
                              {review.service_name} ·{" "}
                              {formatDate(review.created_at)}
                            </span>
                          ) : (
                            <span className="text-xs text-mist">
                              {formatDate(review.created_at)}
                            </span>
                          )}
                        </div>
                        {review.text ? (
                          <p className="mt-1.5 text-sm text-ink-soft">
                            {review.text}
                          </p>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </>
          )}
        </article>
      </div>
    </div>
  );
}

/**
 * One side of the student ID. Renders nothing if that side wasn't uploaded; a
 * signed link when available, or an inert note when the service-role key is
 * missing (paths are private and can't be signed).
 */
function IdDocLink({
  label,
  path,
  url,
}: {
  label: string;
  path: string | null;
  url: string | null;
}) {
  if (!path) return null;
  if (!url) {
    return (
      <span className="text-mist">
        {label}: uploaded (add service-role key to view)
      </span>
    );
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="text-crew-700 underline"
    >
      {label} ↗
    </a>
  );
}
