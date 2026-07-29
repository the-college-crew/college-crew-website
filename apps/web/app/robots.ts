import type { MetadataRoute } from "next";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || "https://www.thecollegecrew.com";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/account",
        "/admin",
        "/api",
        "/book",
        "/dashboard",
        // Flyer tracking paths rewrite to /browse, so indexing them would
        // duplicate that page. Trailing slash matters: bare "/f" is a prefix
        // match that would also deindex /faq and /forgot-password.
        "/f/",
        "/login",
        "/messages",
        "/provider",
        "/signup",
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
