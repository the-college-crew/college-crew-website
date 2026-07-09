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

/**
 * Compact checkmark circle used on dense surfaces (Browse cards); the full
 * label lives in a hover tooltip + sr-only text. Profile and booking pages
 * keep the spelled-out badges above — hover is invisible on touch, and those
 * are the pages where the trust promise must be explicit.
 *
 * The tooltip opens downward: card containers are overflow-hidden, so an
 * upward tooltip would clip at the card edge.
 */
export function CheckCircle({
  tone,
  label,
}: {
  tone: "gold" | "green";
  label: string;
}) {
  return (
    <span className="group relative inline-flex">
      <span
        aria-hidden
        className={cn(
          "flex size-5 items-center justify-center rounded-full text-[11px] font-bold",
          tone === "gold"
            ? "bg-gold-400 text-gold-800"
            : "bg-viridian text-shell",
        )}
      >
        ✓
      </span>
      <span className="sr-only">{label}</span>
      <span
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-full z-10 mt-1.5 -translate-x-1/2 whitespace-nowrap rounded-md bg-viridian px-2 py-1 text-[11px] font-medium text-shell opacity-0 transition-opacity group-hover:opacity-100"
      >
        {label}
      </span>
    </span>
  );
}

export function VerifiedCheck() {
  return <CheckCircle tone="gold" label="Verified student" />;
}
