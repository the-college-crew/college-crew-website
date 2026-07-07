import type { Metadata, Viewport } from "next";
import { Manrope, Newsreader } from "next/font/google";

import { DevBanner } from "@/components/dev-banner";
import { SITE } from "@/lib/site";

import "./globals.css";

const bodyFont = Manrope({
  subsets: ["latin"],
  variable: "--font-public-sans",
});

// Editorial serif for the cream/forest design system (landing + shared chrome).
const serifFont = Newsreader({
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
  subsets: ["latin"],
  variable: "--font-newsreader",
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
      className={`${bodyFont.variable} ${serifFont.variable}`}
    >
      <body className="flex min-h-screen flex-col font-sans">
        <DevBanner />
        {children}
      </body>
    </html>
  );
}
