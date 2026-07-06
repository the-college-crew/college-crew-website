import { cn } from "@/lib/utils";

type Tone = "gold" | "green" | "blue" | "gray" | "red";

const toneClasses: Record<Tone, string> = {
  gold: "border-honeydew bg-honeydew text-viridian",
  green: "border-honeydew bg-honeydew text-viridian",
  blue: "border-sky bg-sky text-viridian",
  gray: "border-stone bg-stone text-ink-soft",
  red: "border-red-200 bg-red-50 text-red-800",
};

export function Badge({
  tone = "gray",
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold",
        toneClasses[tone],
        className,
      )}
      {...props}
    />
  );
}

/** The trust badge: only rendered for ID-approved providers. */
export function VerifiedBadge() {
  return <Badge tone="gold">✓ Verified student</Badge>;
}

export function BackgroundCheckBadge() {
  return <Badge tone="green">✓ Background checked</Badge>;
}
