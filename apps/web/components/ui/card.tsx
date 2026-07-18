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
        "rounded-2xl border border-stone bg-paper shadow-sm shadow-viridian/5",
        pennant && "pennant overflow-hidden",
        className,
      )}
      {...props}
    />
  );
}
