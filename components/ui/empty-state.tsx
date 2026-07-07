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
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-stone bg-paper/70 px-6 py-12 text-center">
      <h3 className="font-display text-xl font-semibold text-viridian">
        {title}
      </h3>
      {children ? (
        <div className="max-w-sm text-sm leading-relaxed text-ink-soft">
          {children}
        </div>
      ) : null}
      {action}
    </div>
  );
}
