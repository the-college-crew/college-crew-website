import Link from "next/link";

import { Wordmark } from "@/components/site-header";
import { getSession } from "@/lib/auth/session";
import { NEIGHBORHOOD, SITE } from "@/lib/site";

const EXPLORE = [
  { href: "/browse", label: "Browse providers" },
  { href: "/about", label: "About us" },
  { href: "/blog", label: "Blog" },
];

export async function SiteFooter() {
  const session = await getSession();
  const exploreItems = session
    ? EXPLORE
    : [
        EXPLORE[0],
        { href: "/provider/onboarding/account", label: "Earn as a student" },
        ...EXPLORE.slice(1),
      ];

  return (
    <footer className="relative overflow-hidden bg-viridian text-shell">
      <div
        aria-hidden
        className="pointer-events-none absolute -right-10 -bottom-16 h-64 w-64 rounded-full bg-shell/5"
      />
      <div className="relative mx-auto max-w-6xl px-4 py-14">
        <div className="grid gap-10 sm:grid-cols-3">
          <div>
            <Wordmark tone="dark" />
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-shell/70">
              {SITE.tagline}
            </p>
            <p className="mt-3 text-xs text-honeydew">
              Now serving {NEIGHBORHOOD.name} — our pilot neighborhood.
            </p>
          </div>

          <nav aria-label="Footer" className="text-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-honeydew">
              Explore
            </p>
            <ul className="mt-4 space-y-2.5 text-shell/70">
              {exploreItems.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="transition-colors hover:text-shell"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <div className="text-xs leading-relaxed text-shell/65">
            <p>
              Every provider is a verified college student (18+). Providers are
              independent — {SITE.name} connects, verifies, and processes
              payments.
            </p>
          </div>
        </div>

        <div className="mt-12 flex flex-col gap-2 border-t border-shell/15 pt-6 text-xs text-shell/50 sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {new Date().getFullYear()} {SITE.name}
          </p>
          <p>Verified students · Curated services · Paid securely in-app</p>
        </div>
      </div>
    </footer>
  );
}
