import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "success" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const variantClasses: Record<Variant, string> = {
  primary: "bg-viridian text-shell hover:bg-viridian-ink",
  secondary: "border border-viridian/35 bg-transparent text-viridian hover:bg-stone/45",
  success: "bg-honeydew text-viridian hover:bg-honeydew/80",
  ghost: "text-viridian hover:bg-stone/45",
  danger: "border border-red-200 bg-paper text-red-700 hover:bg-red-50",
};

const sizeClasses: Record<Size, string> = {
  sm: "px-3 py-1.5 text-xs",
  md: "px-4 py-2 text-sm",
  lg: "px-5 py-2.5 text-base",
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
    "inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-colors disabled:pointer-events-none disabled:opacity-50",
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
