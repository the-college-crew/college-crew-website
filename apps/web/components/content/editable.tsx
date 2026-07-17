import { getSession } from "@/lib/auth/session";
import { getContentMap } from "@/lib/content/content";
import { cn } from "@/lib/utils";

import { EditableText } from "./editable-text";

/**
 * Inline-editable site copy. Wrap a default string and give it a stable key:
 *
 *   <Editable k="home.hero.title">Hometown help, from someone…</Editable>
 *
 * The DB override wins when present. Visitors get plain text (zero client
 * JS); real admins get the interactive leaf that lights up in edit mode.
 * `children` is a string on purpose — interpolated defaults become template
 * literals so the whole sentence is editable as one unit.
 */
export async function Editable({
  k,
  children,
  className,
}: {
  k: string;
  children: string;
  className?: string;
}) {
  const [map, session] = await Promise.all([getContentMap(), getSession()]);
  const value = map.get(k) ?? children;

  // Real role, not the view-as effective role: admins previewing as a
  // customer can still edit (the toggle just defaults to off).
  if (session?.profile.role !== "admin") {
    if (!className && !value.includes("\n")) return <>{value}</>;
    return (
      <span
        className={cn(value.includes("\n") && "whitespace-pre-line", className)}
      >
        {value}
      </span>
    );
  }

  return (
    <EditableText
      k={k}
      value={value}
      defaultValue={children}
      isOverridden={map.has(k)}
      className={className}
    />
  );
}
