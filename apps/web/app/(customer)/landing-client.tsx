"use client";

import Image from "next/image";
import { useId, useState } from "react";

/**
 * Interactive landing sections. All copy arrives pre-rendered from the server
 * page (wrapped in <Editable> so admins can edit it inline); only the
 * tab/accordion state lives here. Section shells match the College Crew design:
 * full-bleed color bands with a 1140px inner wrap.
 */

const BAND =
  "relative overflow-hidden border-t-[1.5px] border-viridian/15 py-[72px] md:py-[104px]";
const EYEBROW =
  "flex items-center gap-2 text-[13px] font-bold uppercase tracking-[0.16em] text-viridian/55";
const H2 =
  "mt-3.5 max-w-[20ch] text-balance font-display text-[32px] font-semibold leading-[1.05] tracking-[-0.02em] text-viridian md:text-[42px]";

export type Step = {
  n: string;
  title: React.ReactNode;
  body: React.ReactNode;
};

export function HowItWorksTabs({
  heading,
  parentSteps,
  studentSteps,
}: {
  heading: React.ReactNode;
  parentSteps: Step[];
  studentSteps: Step[];
}) {
  const [tab, setTab] = useState<"families" | "students">("families");
  const steps = tab === "families" ? parentSteps : studentSteps;

  const pill = (active: boolean) =>
    `rounded-full border-[1.3px] px-[13px] py-2 text-[13px] font-semibold transition duration-200 active:scale-[0.97] ${
      active
        ? "border-viridian bg-viridian text-shell"
        : "border-viridian/20 text-viridian hover:bg-viridian/5"
    }`;

  return (
    <section id="how" className={`${BAND} bg-shell`}>
      <div className="reveal-rise mx-auto w-full max-w-[1140px] px-5 sm:px-8">
        <div className="mb-[52px] flex flex-wrap items-end justify-between gap-5">
          <h2 className={H2}>{heading}</h2>
          <div className="flex gap-2">
            <button
              type="button"
              className={pill(tab === "families")}
              onClick={() => setTab("families")}
            >
              For families
            </button>
            <button
              type="button"
              className={pill(tab === "students")}
              onClick={() => setTab("students")}
            >
              For students
            </button>
          </div>
        </div>

        {/* Open layout: the numbered circles and dashed trail run as
            one continuous path across the section, no card boxes. */}
        <div className="grid gap-10 md:grid-cols-3 md:gap-[22px]">
          {steps.map((step, index) => (
            <div key={step.n} className="group">
              {/* Number + a dashed trail toward the final brand seal. */}
              <div className="flex items-center gap-4">
                <div className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-full bg-viridian font-display text-xl font-bold text-shell transition duration-200 group-hover:scale-105">
                  {step.n}
                </div>
                <span
                  className="h-0 flex-1 border-t-2 border-dashed border-viridian/20"
                  aria-hidden
                />
                {index === steps.length - 1 ? (
                  <Image
                    src="/college-crew-logo.png"
                    alt=""
                    width={32}
                    height={32}
                    className="h-7 w-7 shrink-0 object-contain"
                    aria-hidden
                  />
                ) : null}
              </div>
              <h3 className="mt-5 font-display text-[21px] font-semibold leading-tight text-viridian">
                {step.title}
              </h3>
              <p className="mt-2.5 max-w-[40ch] leading-normal text-viridian/65">
                {step.body}
              </p>
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
  rule,
  eyebrow,
  heading,
  items,
}: {
  /** Decorative ant-rule divider node, rendered above the section heading. */
  rule?: React.ReactNode;
  eyebrow: React.ReactNode;
  heading: React.ReactNode;
  items: FaqItem[];
}) {
  const [open, setOpen] = useState(0);
  const baseId = useId();

  return (
    <section className={`${BAND} bg-stone`}>
      <div className="mx-auto w-full max-w-[820px] px-5 sm:px-8">
        {rule}
        <div className="mb-[52px]">
          <div className={EYEBROW}>{eyebrow}</div>
          <h2 className={H2}>{heading}</h2>
        </div>
        <div>
          {items.map((faq, index) => {
            const isOpen = open === index;
            const panelId = `${baseId}-faq-${index}`;

            return (
              <div
                key={index}
                className="mb-3.5 overflow-hidden rounded-[18px] border-[1.4px] border-viridian/15 bg-card transition duration-200 hover:border-viridian/30 hover:shadow-[0_14px_30px_-24px_rgba(52,73,69,0.5)]"
              >
                <button
                  type="button"
                  aria-expanded={isOpen}
                  aria-controls={panelId}
                  className="flex w-full items-center justify-between gap-5 px-7 py-6 text-left font-display text-xl font-semibold text-viridian"
                  onClick={() => setOpen(isOpen ? -1 : index)}
                >
                  <span>{faq.q}</span>
                  <span
                    className={`shrink-0 text-3xl font-light leading-none text-viridian transition-transform duration-200 ${
                      isOpen ? "rotate-45" : ""
                    }`}
                    aria-hidden
                  >
                    +
                  </span>
                </button>
                {/* grid-rows keeps the answer in the DOM and animates height. */}
                <div
                  id={panelId}
                  className={`grid transition-[grid-template-rows] duration-300 ease-out ${
                    isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                  }`}
                >
                  <div className="overflow-hidden">
                    <p className="max-w-[70ch] px-7 pb-[26px] text-[17px] leading-[1.55] text-viridian/75">
                      {faq.a}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
