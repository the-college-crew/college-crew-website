import { getAllPosts } from "@/lib/blog/posts";
import { getLiveServices } from "@/lib/db/queries";
import { PILOT_SERVICE_AREA, SITE, SITE_URL } from "@/lib/site";

/**
 * /llms.txt — a curated, plain-language index of the site for AI assistants
 * (llmstxt.org).
 *
 * Set expectations low. This is a *proposed* convention, not a standard, and
 * no major AI crawler demonstrably consumes it yet. It costs a few minutes and
 * may pay off later; it is not a substitute for the robots.txt fix or real
 * per-page metadata.
 *
 * A route handler rather than a static `public/llms.txt` on purpose: CLAUDE.md
 * requires the service list stay driven by the `services` table so an admin
 * toggling a service can't leave a stale copy behind. Same reasoning as
 * `sitemap.ts`, which also reads from the database.
 */
export async function GET() {
  const [services, posts] = await Promise.all([getLiveServices(), getAllPosts()]);

  const lines = [
    `# ${SITE.name}`,
    "",
    `> ${SITE.description}`,
    "",
    `${SITE.name} is a pilot operating in one service area — ${PILOT_SERVICE_AREA.name}.`,
    "Every provider is a college student aged 18 or over who has been identity-",
    "verified and manually approved before appearing publicly. Customers browse",
    "providers, request a booking, and pay through the platform.",
    "",
    "## Services",
    "",
    // Links point at the browse filter today. When `/services/<slug>` landing
    // pages ship, point them there instead — those will carry the real copy.
    ...services.map(
      (service) =>
        `- [${service.name}](${SITE_URL}/browse?service=${service.slug}): providers offering ${service.name.toLowerCase()} in ${PILOT_SERVICE_AREA.name}.`,
    ),
    "",
    "## Key pages",
    "",
    `- [Browse providers](${SITE_URL}/browse): every approved provider, filterable by service.`,
    `- [Provider profile index](${SITE_URL}/sitemap.xml): individual profiles live at /providers/<id>; the sitemap lists every one. Each carries schema.org Service markup with pricing and ratings.`,
    `- [About](${SITE_URL}/about): who runs ${SITE.name} and why it exists.`,
    `- [For customers](${SITE_URL}/about/customers): how booking works if you are hiring.`,
    `- [For students](${SITE_URL}/about/students): how it works if you want to provide services.`,
    `- [FAQ](${SITE_URL}/faq): common questions about booking, payment, and verification.`,
    `- [Legal terms](${SITE_URL}/legal): platform, customer booking, and provider agreements.`,
    `- [Privacy policy](${SITE_URL}/privacy): what personal information is collected and why.`,
    "",
  ];

  if (posts.length > 0) {
    lines.push("## Writing", "");
    for (const post of posts) {
      lines.push(`- [${post.title}](${SITE_URL}/blog/${post.slug}): ${post.description}`);
    }
    lines.push("");
  }

  lines.push(
    "## Not available here",
    "",
    "- Provider dashboards, customer accounts, messages, and the booking flow require sign-in and are disallowed in robots.txt.",
    "- Provider contact details and addresses are never public; they are shared only after a booking is confirmed.",
    "",
  );

  return new Response(lines.join("\n"), {
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      "cache-control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
