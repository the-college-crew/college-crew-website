import { cn } from "@/lib/utils";

const controlClasses =
  "block w-full rounded-xl border border-stone bg-paper px-3 py-2 text-sm text-ink placeholder:text-mist shadow-sm shadow-viridian/5 disabled:bg-stone disabled:text-mist";

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
  return <select className={cn(controlClasses, className)} {...props} />;
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
