export function LegalDocumentContent({
  intro,
  sections,
}: {
  intro: readonly string[];
  sections: readonly {
    number?: string;
    title: string;
    body: readonly string[];
  }[];
}) {
  return (
    <div className="space-y-5 text-sm leading-6 text-ink-soft">
      {intro.map((paragraph) => (
        <p key={paragraph} className="max-w-[65ch]">
          {paragraph}
        </p>
      ))}
      {sections.map((section) => (
        <section key={`${section.number ?? ""}-${section.title}`} className="border-t border-line pt-5">
          <h2 className="font-display text-lg font-semibold text-ink">
            {section.number ? `${section.number}. ` : ""}
            {section.title}
          </h2>
          <div className="mt-2 space-y-3">
            {section.body.map((paragraph) => (
              <p key={paragraph} className="max-w-[65ch]">
                {paragraph}
              </p>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
