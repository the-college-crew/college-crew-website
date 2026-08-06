import type { NextConfig } from "next";

import { BLOG_IMAGES_HOST } from "./lib/media/blog-images";

const nextConfig: NextConfig = {
  /**
   * Blog hero photos live in the public `blog-images` Supabase bucket rather
   * than in git — the weekly routine cannot commit a binary file, so a post's
   * frontmatter carries a URL. `next/image` refuses a remote src that is not
   * allow-listed here, so this is what makes those posts render at all.
   *
   * The host is pinned rather than read from `NEXT_PUBLIC_SUPABASE_URL`, which
   * differs per environment now that Preview has its own Supabase project.
   * Blog photos are the same everywhere; see `lib/media/blog-images.ts`.
   */
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: BLOG_IMAGES_HOST,
        pathname: "/storage/v1/object/public/blog-images/**",
      },
    ],
  },
  // Cache Components stays off: nearly every route is per-user and
  // auth-gated, so the default dynamic model is the right one for the pilot.
  experimental: {
    // Server Actions default to a 1 MB body limit, but ID uploads (phone
    // photos of a driver's license) routinely exceed that. The verify step can
    // send both license images (front + back) at once, each capped at 10 MB by
    // the upload form — so allow ~20 MB plus overhead so legitimate files reach
    // the action instead of throwing a framework error before validation runs.
    serverActions: { bodySizeLimit: "22mb" },
    // Experimental flag powering the browse-card → profile morph via React's
    // <ViewTransition>. Removing it degrades navigation to an instant swap.
    viewTransition: true,
  },
  // Flyer / campaign tracking paths. `/f/<name>` serves Browse directly — a
  // rewrite, not a redirect, so the visitor sees Browse instantly while the
  // URL stays `/f/<name>`. That's the whole point: Vercel Analytics records
  // the pageview under the flyer path, giving per-batch scan counts in the
  // Pages tab without the UTM breakdown that the free plan doesn't include.
  // A redirect would record nothing, since a 307 runs no client JavaScript.
  // Deliberately open-ended: a new flyer batch needs a new QR, not a deploy.
  async rewrites() {
    return [{ source: "/f/:slug", destination: "/browse" }];
  },
  // Baseline security headers — Vercel adds none of its own (just
  // X-Vercel-Id for tracing), and this app handles login credentials,
  // driver's-license photos, and live Stripe payments. Deliberately not a
  // full Content-Security-Policy: current guidance is to roll that out in
  // report-only mode for weeks before enforcing, and getting it wrong risks
  // silently breaking Stripe Elements or Supabase Realtime. These four don't
  // restrict what's allowed to load, so they carry no such risk.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
