export function EmptyState({
  title,
  children,
  action,
}: {
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-line bg-paper/60 px-6 py-12 text-center">
      <h3 className="font-display text-lg font-semibold uppercase tracking-wide text-ink-soft">
        {title}
      </h3>
      {children ? (
        <div className="max-w-sm text-sm text-mist">{children}</div>
      ) : null}
      {action}
    </div>
  );
}
