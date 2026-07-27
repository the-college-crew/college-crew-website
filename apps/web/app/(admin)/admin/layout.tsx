import Link from "next/link";

import { MobileNav } from "@/components/mobile-nav";
import { Wordmark } from "@/components/site-header";
import { UserMenu } from "@/components/user-menu";
import { getEffectiveRole, homePathFor, requireRole } from "@/lib/auth/session";

const ADMIN_NAV = [
  { href: "/admin/providers", label: "Provider approvals" },
  { href: "/admin/services", label: "Service curation" },
  { href: "/admin/bookings", label: "Bookings" },
  { href: "/admin/booking-copy", label: "Booking copy" },
  { href: "/admin/disputes", label: "Disputes" },
  { href: "/admin/operations", label: "Operations" },
  { href: "/admin/flagged", label: "Flagged messages" },
  { href: "/admin/support", label: "Support inbox" },
  { href: "/admin/blog", label: "Blog" },
];

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
      <header className="relative border-b border-viridian/15 bg-shell text-viridian">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-4 px-4">
          <div className="flex items-center gap-3">
            <MobileNav nav={ADMIN_NAV} isAuthed tone="light" />
            <Wordmark />
            <span className="rounded-full border border-honeydew/60 bg-honeydew px-2.5 py-0.5 text-xs font-semibold uppercase tracking-[0.14em] text-viridian">
              Admin
            </span>
          </div>
          <div className="flex items-center gap-3">
            <UserMenu
              name={session.profile.full_name}
              email={session.user.email ?? ""}
              homePath={homePathFor(effectiveRole ?? "admin")}
              realRole={session.profile.role}
              currentRole={effectiveRole ?? "admin"}
            />
          </div>
        </div>
        <nav
          aria-label="Admin"
          className="mx-auto hidden max-w-5xl flex-wrap gap-x-5 gap-y-2 px-4 pb-3 text-sm font-semibold text-viridian/70 sm:flex"
        >
          <Link href="/admin/providers" className="hover:text-viridian">
            Provider approvals
          </Link>
          <Link href="/admin/services" className="hover:text-viridian">
            Service curation
          </Link>
          <Link href="/admin/bookings" className="hover:text-viridian">
            Bookings
          </Link>
          <Link href="/admin/booking-copy" className="hover:text-viridian">
            Booking copy
          </Link>
          <Link href="/admin/disputes" className="hover:text-viridian">
            Disputes
          </Link>
          <Link href="/admin/operations" className="hover:text-viridian">
            Operations
          </Link>
          <Link href="/admin/flagged" className="hover:text-viridian">
            Flagged messages
          </Link>
          <Link href="/admin/support" className="hover:text-viridian">
            Support inbox
          </Link>
          <Link href="/admin/blog" className="hover:text-viridian">
            Blog
          </Link>
        </nav>
      </header>
      <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        {children}
      </main>
    </>
  );
}
