import { BackButton } from "@/components/back-button";

export function PageHeader({
  title,
  description,
  actions,
  back = true,
}: {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  /** Show the universal back button top-right. Off for a page's home base. */
  back?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="font-display text-3xl font-semibold leading-tight text-viridian sm:text-4xl">
          {title}
        </h1>
        {description ? (
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-soft">
            {description}
          </p>
        ) : null}
      </div>
      {actions || back ? (
        <div className="flex shrink-0 items-center gap-2">
          {actions}
          {back ? <BackButton /> : null}
        </div>
      ) : null}
    </div>
  );
}
