import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
};

export default nextConfig;
