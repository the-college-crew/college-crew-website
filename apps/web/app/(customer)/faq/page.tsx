import type { Metadata } from "next";

import { Editable } from "@/components/content/editable";
import { PageHeader } from "@/components/ui/page-header";
import { FAQS } from "@/lib/content/defaults";

import { FAQList, type FaqItem } from "../landing-client";

export const metadata: Metadata = { title: "FAQ" };

export default function FaqPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <PageHeader
        title="Frequently asked questions"
        description="Good to know before you book a student or sign up to work."
      />

      <FAQList
        eyebrow={<Editable k="home.faq.eyebrow">FAQ</Editable>}
        heading={<Editable k="home.faq.heading">Good to know.</Editable>}
        items={FAQS.map(
          (faq, index): FaqItem => ({
            q: <Editable k={`home.faq.${index}.q`}>{faq.q}</Editable>,
            a: <Editable k={`home.faq.${index}.a`}>{faq.a}</Editable>,
          }),
        )}
      />
    </div>
  );
}
