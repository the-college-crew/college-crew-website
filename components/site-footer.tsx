import Link from "next/link";

import { NEIGHBORHOOD, SITE } from "@/lib/site";

export function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-line bg-paper">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:grid-cols-3">
        <div>
          <p className="font-display text-lg font-bold uppercase tracking-wide">
            <span className="text-ink">College</span>{" "}
            <span className="text-crew-600">Crew</span>
          </p>
          <p className="mt-2 max-w-xs text-sm text-ink-soft">{SITE.tagline}</p>
          <p className="mt-2 text-xs text-mist">
            Now serving {NEIGHBORHOOD.name} — our pilot neighborhood.
          </p>
        </div>

        <nav aria-label="Footer" className="text-sm">
          <p className="font-display text-sm font-semibold uppercase tracking-[0.18em] text-mist">
            Explore
          </p>
          <ul className="mt-3 space-y-2 text-ink-soft">
            <li>
              <Link href="/browse" className="hover:text-crew-700">
                Browse providers
              </Link>
            </li>
            <li>
              <Link href="/provider/onboarding/account" className="hover:text-crew-700">
                Earn as a student
              </Link>
            </li>
            <li>
              <Link href="/about" className="hover:text-crew-700">
                About us
              </Link>
            </li>
            <li>
              <Link href="/blog" className="hover:text-crew-700">
                Blog
              </Link>
            </li>
          </ul>
        </nav>

        <div className="text-xs text-mist">
          <p>
            Every provider is a verified college student (18+). Providers are
            independent — {SITE.name} connects, verifies, and processes
            payments.
          </p>
          <p className="mt-3">
            © {new Date().getFullYear()} {SITE.name}
          </p>
        </div>
      </div>
    </footer>
  );
}
