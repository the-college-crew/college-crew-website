import type { Metadata } from "next";
import { Barlow_Condensed, Public_Sans } from "next/font/google";

import { DevBanner } from "@/components/dev-banner";
import { SITE } from "@/lib/site";

import "./globals.css";

const displayFont = Barlow_Condensed({
  weight: ["500", "600", "700"],
  subsets: ["latin"],
  variable: "--font-barlow-condensed",
});

const bodyFont = Public_Sans({
  subsets: ["latin"],
  variable: "--font-public-sans",
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${displayFont.variable} ${bodyFont.variable}`}>
      <body className="flex min-h-screen flex-col font-sans">
        <DevBanner />
        {children}
      </body>
    </html>
  );
}
