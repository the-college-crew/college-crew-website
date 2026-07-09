/**
 * Default copy for the landing page's client components (HowItWorksTabs,
 * FAQList). Lives here — importable by server code — so the page can wrap
 * each string in <Editable> and pass the rendered nodes down as props.
 *
 * These are DEFAULTS: an admin's inline edits are stored per-key in
 * site_content and win over this file. Array keys are index-based
 * (home.faq.3.a), so append new items rather than reordering — or clear the
 * overrides when you do.
 */

export const PARENT_STEPS = [
  {
    n: "1",
    title: "Post what you need",
    body: "Describe the job, timing, and what kind of student help would make it easier.",
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

export const STUDENT_STEPS = [
  {
    n: "1",
    title: "Get verified",
    body: "Complete ID verification, student-ID review, and link your school to start taking jobs.",
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

export const FAQS = [
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
    a: "A small per-booking fee funds ID verification, student review, and support if something goes wrong.",
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
