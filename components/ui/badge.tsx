import { cn } from "@/lib/utils";

type Tone = "gold" | "green" | "blue" | "gray" | "red";

const toneClasses: Record<Tone, string> = {
  gold: "border-gold-400/60 bg-gold-100 text-gold-800",
  green: "border-quad-200 bg-quad-100 text-quad-800",
  blue: "border-crew-200 bg-crew-100 text-crew-800",
  gray: "border-line bg-court text-ink-soft",
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
