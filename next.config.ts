import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cache Components stays off: nearly every route is per-user and
  // auth-gated, so the default dynamic model is the right one for the pilot.
  experimental: {
    // Server Actions default to a 1 MB body limit, but ID uploads (phone
    // photos of a student ID) routinely exceed that. Match the 10 MB cap the
    // upload form advertises so legitimate files reach the action instead of
    // throwing a framework error before our validation runs.
    serverActions: { bodySizeLimit: "10mb" },
  },
};

export default nextConfig;
