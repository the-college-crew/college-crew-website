import Link from "next/link";

import { signOut } from "@/app/(auth)/actions";
import { getSession, homePathFor } from "@/lib/auth/session";
import { SITE } from "@/lib/site";
import { cn } from "@/lib/utils";

const serif = "font-[family-name:var(--font-newsreader)]";

const NAV = [
  { href: "/browse", label: "Browse" },
  { href: "/about", label: "About" },
  { href: "/blog", label: "Blog" },
];

/**
 * College Crew wordmark: a forest logo tile + name. `tone` flips it for use on
 * dark surfaces (the forest footer) vs. light ones (the header).
 */
export function Wordmark({ tone = "light" }: { tone?: "light" | "dark" }) {
  const onDark = tone === "dark";
  return (
    <Link href="/" className="flex items-center gap-2.5">
      <span
        className={cn(
          "flex h-8 w-8 items-center justify-center rounded-lg text-lg font-semibold",
          serif,
          onDark ? "bg-cream text-forest-900" : "bg-forest-800 text-cream",
        )}
        aria-hidden
      >
        C
      </span>
      <span
        className={cn(
          "text-lg font-semibold tracking-tight",
          onDark ? "text-cream" : "text-bark",
        )}
      >
        College Crew
      </span>
    </Link>
  );
}

/** Customer-facing site chrome; auth-aware on the right side. */
export async function SiteHeader() {
  const session = await getSession();

  return (
    <header className="sticky top-0 z-40 border-b border-bark-line/70 bg-cream/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
        <div className="flex items-center gap-8">
          <Wordmark />
          <nav
            aria-label="Main"
            className="hidden items-center gap-6 text-sm font-medium text-bark-soft sm:flex"
          >
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="transition-colors hover:text-forest-700"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-1.5">
          {session ? (
            <>
              <Link
                href={homePathFor(session.profile.role)}
                className="rounded-full border border-forest-800/25 px-4 py-1.5 text-sm font-semibold text-forest-800 transition-colors hover:bg-forest-800/[0.06]"
              >
                Dashboard
              </Link>
              <form action={signOut}>
                <button
                  type="submit"
                  className="rounded-full px-3 py-1.5 text-sm font-semibold text-bark-soft transition-colors hover:text-forest-700"
                >
                  Log out
                </button>
              </form>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="rounded-full px-3 py-1.5 text-sm font-semibold text-bark-soft transition-colors hover:text-forest-700"
              >
                Log in
              </Link>
              <Link
                href="/signup"
                className="rounded-full bg-forest-800 px-4 py-1.5 text-sm font-semibold text-cream transition-colors hover:bg-forest-900"
              >
                Get started
              </Link>
            </>
          )}
        </div>
      </div>

      {/* Mobile nav row */}
      <nav
        aria-label="Main mobile"
        className="flex items-center gap-6 border-t border-bark-line/70 px-4 py-2 text-sm font-medium text-bark-soft sm:hidden"
      >
        {NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="transition-colors hover:text-forest-700"
          >
            {item.label}
          </Link>
        ))}
      </nav>
      <span className="sr-only">{SITE.name}</span>
    </header>
  );
}
