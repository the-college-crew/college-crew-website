import Link from "next/link";

import { Wordmark } from "@/components/site-header";
import { NEIGHBORHOOD, SITE } from "@/lib/site";

const EXPLORE = [
  { href: "/browse", label: "Browse providers" },
  { href: "/provider/onboarding/account", label: "Earn as a student" },
  { href: "/about", label: "About us" },
  { href: "/blog", label: "Blog" },
];

export function SiteFooter() {
  return (
    <footer className="bg-forest-900 text-cream">
      <div className="mx-auto max-w-6xl px-4 py-14">
        <div className="grid gap-10 sm:grid-cols-3">
          <div>
            <Wordmark tone="dark" />
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-forest-100">
              {SITE.tagline}
            </p>
            <p className="mt-3 text-xs text-sage-200">
              Now serving {NEIGHBORHOOD.name} — our pilot neighborhood.
            </p>
          </div>

          <nav aria-label="Footer" className="text-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sage-200">
              Explore
            </p>
            <ul className="mt-4 space-y-2.5 text-forest-100">
              {EXPLORE.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="transition-colors hover:text-cream"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <div className="text-xs leading-relaxed text-forest-100/80">
            <p>
              Every provider is a verified college student (18+). Providers are
              independent — {SITE.name} connects, verifies, and processes
              payments.
            </p>
          </div>
        </div>

        <div className="mt-12 flex flex-col gap-2 border-t border-cream/15 pt-6 text-xs text-sage-200 sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {new Date().getFullYear()} {SITE.name}
          </p>
          <p>Verified students · Curated services · Paid securely in-app</p>
        </div>
      </div>
    </footer>
  );
}
