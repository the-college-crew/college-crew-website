import { cn } from "@/lib/utils";

type Size = "sm" | "md" | "lg";

const sizeClasses: Record<Size, string> = {
  sm: "size-8 text-xs",
  md: "size-9 text-xs",
  lg: "size-11 text-sm",
};

/** Cycles through existing palette tones — no new colors introduced. */
const toneClasses = [
  "bg-viridian text-shell",
  "bg-honeydew text-viridian",
  "bg-sky text-viridian",
  "bg-gold-400 text-viridian-ink",
];

function initialsFor(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

function toneFor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  return toneClasses[hash % toneClasses.length];
}

/** Deterministic initials avatar — every person gets the same tone every time, no photo needed. */
export function Avatar({
  name,
  size = "md",
  className,
}: {
  name: string;
  size?: Size;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full font-display font-semibold",
        sizeClasses[size],
        toneFor(name),
        className,
      )}
    >
      <span aria-hidden>{initialsFor(name)}</span>
      <span className="sr-only">{name}</span>
    </span>
  );
}
