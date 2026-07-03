import { setViewAs } from "@/app/actions/view-as";
import type { UserRole } from "@/lib/db/types";

const VIEWS: { role: UserRole; label: string }[] = [
  { role: "admin", label: "Admin" },
  { role: "customer", label: "Customer" },
  { role: "provider", label: "Provider" },
];

/**
 * Admin-only header pills to preview the site as another role. Render only
 * when the real role is admin; `current` is the effective (previewed) role.
 */
export function ViewAsSwitcher({ current }: { current: UserRole }) {
  return (
    <form
      action={setViewAs}
      className="flex items-center gap-1 rounded-full border border-line bg-court p-1 text-xs font-medium"
    >
      <span className="hidden pl-2 pr-1 text-mist md:inline">Viewing as</span>
      {VIEWS.map((view) => (
        <button
          key={view.role}
          type="submit"
          name="viewAs"
          value={view.role}
          aria-pressed={current === view.role}
          className={
            current === view.role
              ? "rounded-full bg-crew-600 px-2.5 py-1 text-white"
              : "rounded-full px-2.5 py-1 text-ink-soft hover:text-crew-700"
          }
        >
          {view.label}
        </button>
      ))}
    </form>
  );
}
