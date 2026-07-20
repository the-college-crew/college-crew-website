import { cn } from "@/lib/utils";

const controlClasses =
  "block w-full min-h-11 rounded-xl border-[1.4px] border-viridian/25 bg-paper px-3.5 py-2 text-sm text-ink placeholder:text-mist transition-colors hover:border-viridian/45 focus-visible:border-viridian focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-viridian/15 disabled:bg-stone disabled:text-mist disabled:hover:border-viridian/25";

export function Label({
  className,
  ...props
}: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn("mb-1.5 block text-sm font-medium text-ink", className)}
      {...props}
    />
  );
}

export function Input({
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(controlClasses, className)} {...props} />;
}

export function Textarea({
  className,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(controlClasses, className)} {...props} />;
}

export function Select({
  className,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(controlClasses, "brand-select", className)} {...props} />
  );
}

export function FieldHint({
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p className={cn("mt-1.5 text-xs text-mist", className)} {...props} />
  );
}

/** Inline error line for form fields and action results. */
export function FieldError({
  children,
}: {
  children: React.ReactNode | null | undefined;
}) {
  if (!children) return null;
  return <p className="mt-1.5 text-xs font-medium text-red-700">{children}</p>;
}
