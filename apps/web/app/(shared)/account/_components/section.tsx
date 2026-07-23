import { Card } from "@/components/ui/card";

/** One settings card inside a panel. */
export function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="p-6">
      <h2 className="font-display text-xl font-semibold">{title}</h2>
      {description ? (
        <p className="mt-1 text-sm text-ink-soft">{description}</p>
      ) : null}
      <div className="mt-5">{children}</div>
    </Card>
  );
}
