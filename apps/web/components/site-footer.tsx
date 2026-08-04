import Image from "next/image";
import Link from "next/link";

import { Editable } from "@/components/content/editable";
import { getSession } from "@/lib/auth/session";
import { PILOT_SERVICE_AREA, SITE } from "@/lib/site";

const EXPLORE = [
  { href: "/browse", label: "Browse providers" },
  { href: "/about", label: "About us" },
  { href: "/blog", label: "Blog" },
  { href: "/faq", label: "FAQ" },
  { href: "/support", label: "Feedback & support" },
  { href: "/privacy", label: "Privacy Policy" },
  { href: "/legal", label: "Legal documents" },
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
    // The border keeps the footer from melting into the landing page's dark
    // CTA band, which is a near-identical green.
    <footer className="border-t border-shell/15 bg-viridian-deep text-shell">
      <div className="mx-auto max-w-[1140px] px-5 pb-10 pt-[72px] sm:px-8">
        <div className="grid items-start gap-12 md:grid-cols-[1.4fr_1fr]">
          <div>
            <Link href="/" aria-label={`${SITE.name} home`} className="inline-flex">
              <Image
                src="/college-crew-logo.png"
                alt=""
                width={88}
                height={88}
                className="h-[88px] w-[88px] object-contain"
              />
            </Link>
            <p className="mt-5 max-w-[38ch] text-[19px] leading-[1.55] text-shell/90">
              <Editable k="footer.tagline">{SITE.tagline}</Editable>
            </p>
            {/*
              Wording matches the live site_content override for this key, on
              purpose. An override wins over this default (components/content/
              editable.tsx), so while one exists the footer silently stops
              following PILOT_SERVICE_AREA — which is how it kept advertising a
              stale service area after #184/#185 moved it. Aligning the default
              with the copy already in the DB means resetting the override
              changes nothing visible and hands the footer back to the
              constant. If you reword this, reset the override too or the
              change will not appear.
            */}
            <p className="mt-4 text-sm text-shell/70">
              <Editable k="footer.pilot-note">
                {`Now booking across ${PILOT_SERVICE_AREA.name}, our pilot neighborhood.`}
              </Editable>
            </p>
          </div>

          <nav aria-label="Footer">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-shell/55">
              Explore
            </p>
            <ul className="mt-3 space-y-[11px] text-[15px] font-medium">
              {exploreItems.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="text-shell/80 transition-colors hover:text-white"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        <div className="mt-12 flex flex-wrap justify-between gap-x-5 gap-y-2 border-t border-shell/15 pt-[26px] text-[13px] text-shell/60">
          <p>
            © {new Date().getFullYear()} {SITE.name} ·{" "}
            <Editable k="footer.strapline">
              Verified students · Curated services · Paid securely in-app
            </Editable>
          </p>
          <p>
            <Editable k="footer.independent">
              {`Providers are independent. ${SITE.name} connects, verifies, and processes payments.`}
            </Editable>
          </p>
        </div>
      </div>
    </footer>
  );
}
