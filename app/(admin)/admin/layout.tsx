import Link from "next/link";

import { Wordmark } from "@/components/site-header";
import { UserMenu } from "@/components/user-menu";
import { ViewAsSwitcher } from "@/components/view-as-switcher";
import { getEffectiveRole, homePathFor, requireRole } from "@/lib/auth/session";

/**
 * Founders-only area. The layout gates for UX; every admin action re-checks
 * requireRole("admin") itself, and RLS/service-role boundaries are the real
 * enforcement.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireRole("admin", "/admin");
  const effectiveRole = await getEffectiveRole();

  return (
    <>
      <header className="pennant border-b border-line bg-paper">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-4 px-4">
          <div className="flex items-center gap-3">
            <Wordmark />
            <span className="rounded-full border border-gold-400/60 bg-gold-100 px-2.5 py-0.5 font-display text-xs font-semibold uppercase tracking-wide text-gold-800">
              Admin
            </span>
          </div>
          <div className="flex items-center gap-3">
            <ViewAsSwitcher current={effectiveRole ?? "admin"} />
            <UserMenu
              name={session.profile.full_name}
              email={session.user.email ?? ""}
              homePath={homePathFor(effectiveRole ?? "admin")}
            />
          </div>
        </div>
        <nav
          aria-label="Admin"
          className="mx-auto flex max-w-5xl gap-6 px-4 pb-3 text-sm font-medium text-ink-soft"
        >
          <Link href="/admin/providers" className="hover:text-crew-700">
            Provider approvals
          </Link>
          <Link href="/admin/services" className="hover:text-crew-700">
            Service curation
          </Link>
        </nav>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        {children}
      </main>
    </>
  );
}
