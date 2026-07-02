import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cache Components stays off: nearly every route is per-user and
  // auth-gated, so the default dynamic model is the right one for the pilot.
};

export default nextConfig;
