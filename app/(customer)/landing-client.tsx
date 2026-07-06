"use client";

import { useState } from "react";

const PARENT_STEPS = [
  {
    n: "1",
    title: "Post what you need",
    body: "Lawn care, dog walking, cleaning, tutoring: describe the job and your schedule.",
  },
  {
    n: "2",
    title: "Get matched by proximity & school",
    body: 'See verified students nearby, like "2 miles away - verified Northwestern sophomore," and pick one.',
  },
  {
    n: "3",
    title: "Book, pay, rebook",
    body: "Pay securely in-app, rate the job, and set up recurring visits as a season pass.",
  },
];

const STUDENT_STEPS = [
  {
    n: "1",
    title: "Get verified",
    body: "Complete ID and background verification, and link your school to start taking jobs.",
  },
  {
    n: "2",
    title: "Take jobs near home or campus",
    body: "Browse local families who want to book a verified student like you.",
  },
  {
    n: "3",
    title: "Get paid, keep your reputation",
    body: "Get paid securely in-app, and carry your reviews with you between home and campus.",
  },
];

const FAQS = [
  {
    q: "Is this only for teenagers?",
    a: "No. Students on College Crew are enrolled college students, 18 and up, not minors.",
  },
  {
    q: "How does payment work?",
    a: "Booking, payment, and ratings all happen in the app. No cash and no separate Venmo requests.",
  },
  {
    q: "What does the Trust & Safety fee cover?",
    a: "A small per-booking fee funds ID verification, background checks, and support if something goes wrong.",
  },
  {
    q: "Can I book the same student again next season?",
    a: "Yes. Reviews and booking history travel with a student, so rebooking someone you liked is one tap.",
  },
  {
    q: "Where is College Crew available?",
    a: "We are launching in select suburban communities and nearby college campuses, with more areas coming soon.",
  },
];

export function HowItWorksTabs() {
  const [tab, setTab] = useState<"families" | "students">("families");
  const steps = tab === "families" ? PARENT_STEPS : STUDENT_STEPS;

  return (
    <section id="how" className="brand-section bg-stone">
      <div className="mx-auto max-w-6xl px-4">
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div>
            <span className="brand-eyebrow">How it works</span>
            <h2 className="mt-4 max-w-2xl font-display text-4xl font-semibold leading-tight text-viridian">
              Simple for families. Rewarding for students.
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

export function FAQList() {
  const [open, setOpen] = useState(0);

  return (
    <section className="brand-section relative overflow-hidden bg-stone">
      <div className="mx-auto max-w-[792px] px-4">
        <span className="brand-eyebrow">FAQ</span>
        <h2 className="mt-4 font-display text-4xl font-semibold text-viridian">
          Good to know.
        </h2>
        <div className="mt-7 space-y-3">
          {FAQS.map((faq, index) => {
            const isOpen = open === index;

            return (
              <div
                key={faq.q}
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
