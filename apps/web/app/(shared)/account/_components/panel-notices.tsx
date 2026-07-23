import type { ReadinessIssue } from "@/lib/provider/settings-readiness";

/**
 * Replaces the old standalone readiness checklist: each outstanding
 * requirement surfaces at the top of the panel that fixes it. Founder-gated
 * items render neutral so they don't read as the provider's homework.
 */
export function PanelNotices({
  issues,
}: {
  issues: readonly ReadinessIssue[];
}) {
  const actionable = issues.filter((issue) => issue.actionable);
  const informational = issues.filter((issue) => !issue.actionable);

  if (issues.length === 0) return null;

  return (
    <div className="space-y-3">
      {actionable.length > 0 ? (
        <div className="rounded-lg border border-gold-300 bg-gold-100 p-4 text-sm text-gold-800">
          <p className="font-semibold">
            {actionable.length === 1
              ? "One thing left here"
              : `${actionable.length} things left here`}
          </p>
          <ul className="mt-2 space-y-1">
            {actionable.map((issue) => (
              <li key={issue.key}>{issue.message}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {informational.length > 0 ? (
        <div className="rounded-lg border border-line bg-court p-4 text-sm text-ink-soft">
          <ul className="space-y-1">
            {informational.map((issue) => (
              <li key={issue.key}>{issue.message}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
