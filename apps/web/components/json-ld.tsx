/**
 * Renders a JSON-LD structured data block.
 *
 * `<` is escaped so a stray `</script>` inside any string value cannot close
 * the tag early — the same guard used inline on the provider profile page.
 */
export function JsonLd({ schema }: { schema: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(schema).replace(/</g, "\\u003c"),
      }}
    />
  );
}
