import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "success" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const variantClasses: Record<Variant, string> = {
  primary: "bg-crew-600 text-white hover:bg-crew-700",
  secondary: "border border-line bg-paper text-ink hover:bg-crew-50",
  success: "bg-quad-600 text-white hover:bg-quad-700",
  ghost: "text-crew-700 hover:bg-crew-50",
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
    "inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-colors disabled:pointer-events-none disabled:opacity-50",
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
