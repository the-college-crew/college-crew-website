import rehypeSlug from "rehype-slug";
import rehypeStringify from "rehype-stringify";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";

/**
 * Markdown → HTML for blog post bodies.
 *
 * `rehype-slug` gives every heading a stable `id`. That is what lets a search
 * result or an AI answer engine deep-link the specific section that answered
 * the question, rather than dropping the reader at the top of the page.
 *
 * Post bodies are first-party content committed to this repo and reviewed in a
 * PR before they ship, so the output is rendered without sanitizing. Never feed
 * user-submitted markdown through this.
 */
const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkRehype)
  .use(rehypeSlug)
  .use(rehypeStringify);

export async function renderMarkdown(markdown: string): Promise<string> {
  const file = await processor.process(markdown);
  return String(file);
}
