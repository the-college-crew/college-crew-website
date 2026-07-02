import { cn } from "@/lib/utils";

export function Card({
  pennant = false,
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  /** Adds the signature two-tone top stripe. */
  pennant?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-line bg-paper shadow-sm",
        pennant && "pennant overflow-hidden",
        className,
      )}
      {...props}
    />
  );
}
