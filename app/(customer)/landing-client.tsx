"use client";

import { useState } from "react";

/**
 * Interactive landing sections. All copy arrives pre-rendered from the server
 * page (wrapped in <Editable> so admins can edit it inline); only the
 * tab/accordion state lives here.
 */

export type Step = {
  n: string;
  title: React.ReactNode;
  body: React.ReactNode;
};

export function HowItWorksTabs({
  eyebrow,
  heading,
  parentSteps,
  studentSteps,
}: {
  eyebrow: React.ReactNode;
  heading: React.ReactNode;
  parentSteps: Step[];
  studentSteps: Step[];
}) {
  const [tab, setTab] = useState<"families" | "students">("families");
  const steps = tab === "families" ? parentSteps : studentSteps;

  return (
    <section id="how" className="brand-section bg-stone">
      <div className="mx-auto max-w-6xl px-4">
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div>
            <span className="brand-eyebrow">{eyebrow}</span>
            <h2 className="mt-4 max-w-2xl font-display text-4xl font-semibold leading-tight text-viridian">
              {heading}
            </h2>
          </div>
          <div className="flex rounded-xl bg-shell p-1.5">
            <button
              type="button"
              className={`rounded-lg px-4 py-2 text-sm font-bold text-viridian transition ${
                tab === "families" ? "bg-paper opacity-100" : "opacity-55"
              }`}
              onClick={() => setTab("families")}
            >
              For families
            </button>
            <button
              type="button"
              className={`rounded-lg px-4 py-2 text-sm font-bold text-viridian transition ${
                tab === "students" ? "bg-paper opacity-100" : "opacity-55"
              }`}
              onClick={() => setTab("students")}
            >
              For students
            </button>
          </div>
        </div>

        <div className="mt-12 grid gap-8 md:grid-cols-3">
          {steps.map((step) => (
            <div key={step.n} className="flex items-start gap-4">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-viridian text-sm font-bold text-shell">
                {step.n}
              </div>
              <div>
                <h3 className="text-lg font-bold text-viridian">
                  {step.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-viridian/70">
                  {step.body}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export type FaqItem = {
  q: React.ReactNode;
  a: React.ReactNode;
};

export function FAQList({
  eyebrow,
  heading,
  items,
}: {
  eyebrow: React.ReactNode;
  heading: React.ReactNode;
  items: FaqItem[];
}) {
  const [open, setOpen] = useState(0);

  return (
    <section className="brand-section relative overflow-hidden bg-stone">
      <div className="mx-auto max-w-[792px] px-4">
        <span className="brand-eyebrow">{eyebrow}</span>
        <h2 className="mt-4 font-display text-4xl font-semibold text-viridian">
          {heading}
        </h2>
        <div className="mt-7 space-y-3">
          {items.map((faq, index) => {
            const isOpen = open === index;

            return (
              <div
                key={index}
                className="rounded-2xl bg-shell px-5 py-2 shadow-sm shadow-viridian/5"
              >
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-4 py-4 text-left text-base font-bold text-viridian"
                  onClick={() => setOpen(isOpen ? -1 : index)}
                >
                  <span>{faq.q}</span>
                  <span
                    className={`text-sm transition-transform ${
                      isOpen ? "rotate-180" : ""
                    }`}
                    aria-hidden
                  >
                    v
                  </span>
                </button>
                {isOpen ? (
                  <p className="-mt-1 pb-4 text-sm leading-relaxed text-viridian/70">
                    {faq.a}
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
