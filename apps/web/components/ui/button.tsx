import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "success" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

/*
 * All variants carry the same 1.6px border so sizes match across variants;
 * ghost keeps its border transparent instead of dropping it.
 */
const variantClasses: Record<Variant, string> = {
  primary: "border-viridian bg-viridian text-shell hover:bg-viridian-ink",
  secondary: "border-viridian text-viridian hover:bg-viridian/5",
  success: "border-honeydew bg-honeydew text-viridian hover:bg-honeydew/80",
  ghost: "border-transparent text-viridian hover:bg-stone/45",
  danger: "border-red-200 bg-paper text-red-700 hover:bg-red-50",
};

const sizeClasses: Record<Size, string> = {
  sm: "px-3.5 py-1.5 text-xs",
  md: "px-5 py-2 text-sm",
  lg: "px-[26px] py-3 text-base",
};

/** Class builder shared by <Button> and links styled as buttons. */
export function buttonClasses({
  variant = "primary",
  size = "md",
  className,
}: {
  variant?: Variant;
  size?: Size;
  className?: string;
} = {}) {
  return cn(
    "inline-flex items-center justify-center gap-2 rounded-full border-[1.6px] font-semibold transition duration-200 hover:-translate-y-px active:translate-y-0 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50",
    variantClasses[variant],
    sizeClasses[size],
    className,
  );
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  type = "button",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
}) {
  return (
    <button
      type={type}
      className={buttonClasses({ variant, size, className })}
      {...props}
    />
  );
}
