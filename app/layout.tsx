import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Hanken_Grotesk } from "next/font/google";
import NextTopLoader from "nextjs-toploader";

import { DevBanner } from "@/components/dev-banner";
import { FeedbackLauncher } from "@/components/feedback-launcher";
import { SITE } from "@/lib/site";

import "./globals.css";

const bodyFont = Hanken_Grotesk({
  subsets: ["latin"],
  variable: "--font-hanken",
});

// Characterful grotesque for headings — the ant-mascot homepage design pairs
// Bricolage Grotesque display type with Hanken Grotesk body text.
const displayFont = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-bricolage",
});

export const metadata: Metadata = {
  title: {
    default: `${SITE.name} — student help for your home`,
    template: `%s · ${SITE.name}`,
  },
  description: SITE.description,
  // PILOT ONLY — keep search engines out while pages are thin/unfinished.
  // REMOVE THIS `robots` block on launch day so Google can index the site.
  robots: {
    index: false,
    follow: false,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${bodyFont.variable} ${displayFont.variable}`}
    >
      <body className="flex min-h-screen flex-col font-sans">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-full focus:bg-viridian focus:px-5 focus:py-3 focus:text-sm focus:font-semibold focus:text-shell"
        >
          Skip to content
        </a>
        {/* Gold, not forest: the sticky header is bg-viridian (#344945), so a
            forest bar would be invisible against it. Gold reads on both the
            forest header and the cream body. */}
        <NextTopLoader
          color="#c5c27d"
          height={3}
          showSpinner={false}
          shadow="0 0 10px #c5c27d, 0 0 5px #c5c27d"
        />
        <DevBanner />
        {children}
        <FeedbackLauncher />
      </body>
    </html>
  );
}
