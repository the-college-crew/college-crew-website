import type { UserRole } from "@/lib/db/types";

export const LEGAL_CONTENT_VERSION = "2026-07-29.1";
export const PLATFORM_TERMS_VERSION = "2026-07-29.1";
export const CUSTOMER_BOOKING_TERMS_VERSION = "2026-07-27";
export const PROVIDER_TERMS_VERSION = "2026-07-15";
export const BOOKING_RISK_VERSION = "2026-07-15";
export const QUOTE_BOOKING_RISK_VERSION = "quote-v2-2026-07-27";

export type LegalDocumentKind =
  | "platform_terms"
  | "customer_booking_terms"
  | "provider_terms";

export type LegalSource = "pdf" | "drafted";

export type LegalSection = {
  number: string;
  title: string;
  body: string[];
  appliesTo: "all" | "provider";
};

export type ServiceRiskAddendum = {
  title: string;
  source: LegalSource;
  body: string[];
};

export type HourlyTermsSection = {
  title: string;
  body: string[];
};

export const MASTER_INTRO = [
  "This Master Service Agreement (\"Agreement\") is entered into between College Crew LLC, an Illinois limited liability company (the \"Company\" or \"College Crew\") and the undersigned individual (\"User\"). By creating an account, User agrees to the terms below.",
] as const;

export const MASTER_SECTIONS: LegalSection[] = [
  {
    number: "1",
    title: "Parties & Platform Role",
    appliesTo: "all",
    body: [
      "College Crew operates an online marketplace (the \"Platform\") that connects college students who offer household and personal services (\"Students\") with families and individuals who wish to book such services (\"Families\"). College Crew is not a party to, and does not perform, any service booked through the Platform. College Crew does not employ, supervise, train, direct, or control the manner in which any Student performs a service. No agency, partnership, joint venture, or employment relationship is created between College Crew and any User by virtue of this Agreement or use of the Platform.",
    ],
  },
  {
    number: "2",
    title: "Independent Contractor Status (Students Only)",
    appliesTo: "provider",
    body: [
      "Each Student acknowledges and agrees that they are an independent contractor and not an employee, agent, or representative of College Crew. Student controls the manner, means, and method by which they perform each booked service. Student is solely responsible for all applicable federal, state, and local taxes arising from compensation earned through the Platform, and understands that College Crew does not withhold taxes on Student's behalf. Student is not entitled to unemployment insurance, workers' compensation coverage, or any other employee benefit through College Crew. Student may accept or decline any booking request at Student's sole discretion.",
    ],
  },
  {
    number: "3",
    title: "Verification Scope Disclosure",
    appliesTo: "all",
    body: [
      "College Crew verifies the following about each Student prior to activation on the Platform: (a) a valid .edu email address associated with an accredited college or university, and (b) government-issued photo identification matching the name on the Student's account. College Crew does NOT conduct criminal background checks, does NOT verify professional certifications (including but not limited to CPR, first aid, or child care credentials), does NOT verify driving records, and does NOT independently confirm prior work experience or references, except where a specific service category expressly states otherwise. Family acknowledges this verification scope and agrees that College Crew makes no representation beyond what is stated in this Section.",
    ],
  },
  {
    number: "4",
    title: "General Assumption of Risk",
    appliesTo: "all",
    body: [
      "User acknowledges that services booked through the Platform are performed in person and may involve inherent risks of injury, illness, property damage, or loss. Risks specific to each category of service are further described in the Booking Risk Addendum presented at the time of booking (see Part B) and are incorporated into this Agreement by reference. User voluntarily assumes all such risks to the fullest extent permitted by law.",
    ],
  },
  {
    number: "5",
    title: "Indemnification",
    appliesTo: "all",
    body: [
      "Student agrees to indemnify, defend, and hold harmless College Crew, its members, officers, and affiliates from and against any claim, loss, damage, or expense (including reasonable attorneys' fees) arising out of or relating to Student's negligence, willful misconduct, or breach of this Agreement in connection with a booked service.",
      "Family agrees to indemnify, defend, and hold harmless College Crew from and against any claim, loss, damage, or expense arising out of or relating to unsafe conditions on Family's property, undisclosed hazards, or Family's own negligence or misconduct toward a Student. This Section survives termination of this Agreement.",
    ],
  },
  {
    number: "6",
    title: "No Insurance Disclosure",
    appliesTo: "all",
    body: [
      "College Crew does not provide general liability insurance, health insurance, workers' compensation coverage, or any other insurance coverage to Students or Families in connection with services booked through the Platform. Any Trust & Safety fee charged by College Crew does not constitute insurance and does not guarantee reimbursement for any loss.",
    ],
  },
  {
    number: "7",
    title: "Payment Terms Tie-In",
    appliesTo: "all",
    body: [
      "Fees, commissions, and cancellation terms are governed by College Crew's Fee Schedule and Terms of Service, as may be updated from time to time and incorporated herein by reference.",
    ],
  },
  {
    number: "8",
    title: "Dispute Resolution",
    appliesTo: "all",
    body: [
      "Any dispute arising out of or relating to this Agreement shall be resolved through binding arbitration administered by the American Arbitration Association (\"AAA\") under its Consumer Arbitration Rules, conducted in Lake County, Illinois, except that either party may elect to bring an individual claim in small claims court in Lake County, Illinois if the claim qualifies under Illinois's small claims jurisdictional limits. The parties waive any right to bring or participate in a class, collective, or representative action. This Agreement is governed by the laws of the State of Illinois, without regard to conflict-of-law principles. Before initiating a formal claim, the parties agree to attempt informal resolution by providing written notice to the other party at the contact information below.",
    ],
  },
  {
    number: "9",
    title: "Term & Termination",
    appliesTo: "all",
    body: [
      "This Agreement remains in effect for as long as User maintains an active account on the Platform. College Crew may suspend or terminate any User's account at its sole discretion, with or without notice, for violation of this Agreement, safety concerns, or any other reason. Sections 2 (as applicable), 5, 6, and 8 survive termination.",
    ],
  },
  {
    number: "10",
    title: "Severability, Amendment & Entire Agreement",
    appliesTo: "all",
    body: [
      "If any provision of this Agreement is held invalid or unenforceable, the remaining provisions shall remain in full force and effect. College Crew may amend this Agreement from time to time; material changes will be communicated by email to the address on file and require re-acceptance before continued use of the Platform. This Agreement, together with the Fee Schedule and Terms of Service, constitutes the entire agreement between the parties regarding its subject matter.",
      "Notices under this Agreement should be submitted through College Crew's public support form at https://www.thecollegecrew.com/support. The sender should include current contact information and enough detail to identify the account and matter.",
    ],
  },
];

/**
 * Modular terms published after unified accounts. The legacy customer/provider
 * snapshots below stay byte-for-byte stable so exact prior acceptances remain
 * provable; new users accept only the document relevant to the action at hand.
 */
export const PLATFORM_TERMS_SECTIONS = MASTER_SECTIONS.filter(
  (section) => section.appliesTo === "all" && section.number !== "5",
);

export const HOURLY_TERMS_INTRO = [
  "These Hourly Booking Terms and Fee Schedule apply to each booking identified as an hourly booking. They supplement the Master Service Agreement. If these terms conflict with general marketplace copy, these terms control for that hourly booking.",
] as const;

export const HOURLY_TERMS_SECTIONS: HourlyTermsSection[] = [
  {
    title: "Customer charges and billing time",
    body: [
      "Customers pay the provider's hourly rate for billable work. College Crew does not add a separate customer platform fee during the pilot.",
      "Each hourly booking has a one-hour minimum. Time after the first hour is billed in 15-minute increments.",
      "A customer's estimate may be between 60 minutes and 12 hours and is not the final bill. After completing the work, the provider submits actual billable time between 60 minutes and 24 hours in 15-minute increments. Time above the customer's estimate requires a written explanation.",
    ],
  },
  {
    title: "Provider fee",
    body: [
      "College Crew deducts a platform fee equal to 5% of the final job charge from the provider's payout. The provider receives 95%, subject to refunds, disputes, and Stripe's processing rules.",
      "College Crew absorbs Stripe's payment-processing fee during the pilot. The processing fee is not added to the customer's bill and does not reduce the provider's stated 95% share.",
      "The 5% fee is snapshotted when the booking request is created. A later Fee Schedule change does not alter an existing booking.",
    ],
  },
  {
    title: "Request, acceptance, and first-hour payment",
    body: [
      "Sending a request does not charge the customer and does not guarantee the booking. The provider may accept or decline. The provider's acceptance reserves the requested time while the customer completes the first-hour payment.",
      "The first-hour payment is due at the earlier of 12 hours after acceptance or the scheduled start. If payment is not completed by that deadline, the reservation may expire.",
      "The saved payment method is scoped to the same booking. It is not a wallet balance or authorization for unrelated bookings. The first-hour payment is credited only against the same booking's final invoice.",
      "Stripe webhooks determine whether a payment succeeded. A late success after the payment deadline is refunded and does not revive the booking.",
    ],
  },
  {
    title: "Invoice review and final payment",
    body: [
      "After arriving and completing the work, the provider submits actual billable time and any required over-estimate explanation. The customer may confirm the invoice and pay the remaining balance immediately.",
      "If the customer neither confirms nor opens a dispute, College Crew may attempt the saved payment method 24 hours after invoice submission.",
      "A failed charge or a charge requiring authentication remains unpaid. The booking is not marked completed until payment succeeds or an authorized founder resolution waives the balance.",
    ],
  },
  {
    title: "Cancellations and refunds",
    body: [
      "Before arrival, a provider cancellation returns all captured booking payments to the original payment method, and the customer may request an available replacement. A request or accepted reservation that has not been paid has no payment to refund.",
      "Before arrival, a customer cancellation at least 12 hours before the scheduled start returns all captured booking payments to the original payment method. If the customer cancels less than 12 hours before the scheduled start, the first-hour payment is not refundable: the provider retains 95% and College Crew retains 5%, while College Crew absorbs Stripe processing fees.",
      "If the provider has not marked Arrived by the scheduled start, the customer may report a provider no-show. After the provider marks Arrived, cancellation, service, time, and payment concerns are handled through the internal dispute process; no automatic refund or cancellation is triggered.",
      "Approved refunds return money to the original payment method. Timing after approval is controlled by Stripe and the customer's financial institution.",
    ],
  },
  {
    title: "Internal disputes",
    body: [
      "A customer may open a dispute while reviewing the provider's invoice or for seven days after the final charge succeeds. Opening a timely dispute before the automatic balance charge freezes that charge while College Crew reviews the matter.",
      "The customer supplies a category and narrative. Opening a dispute does not let the customer edit the provider's submitted time or trigger an automatic refund.",
      "College Crew founders review disputes manually. They may approve the submitted hours, reduce billable time, waive the remaining balance, or cancel and refund captured booking payments. Every resolution includes an internal audit note, and College Crew may request additional information from either party.",
      "This internal review process does not remove rights that cannot legally be waived and does not resolve the separate formal-dispute forum language in the Master Service Agreement.",
    ],
  },
  {
    title: "Availability, response windows, and replacements",
    body: [
      "Provider availability and minimum notice describe when a customer may send a request; they do not guarantee that the provider will accept.",
      "The customer selects a response window. Reaching that alert time does not automatically expire the original request. The original remains open until it is accepted, declined, withdrawn, replaced, or reaches the scheduled start.",
      "Sending a replacement request withdraws the original request. College Crew does not silently or automatically rebook the customer. Replacement suggestions are limited to providers whose current setup and schedule fit the request. Private service ZIPs and customer addresses are not disclosed in public results.",
    ],
  },
  {
    title: "Notifications",
    body: [
      "Material booking, payment, refund, cancellation, invoice, dispute, and recovery events may be communicated through transactional email and state-based dashboard notices.",
      "Email and dashboard notices are conveniences. Users remain responsible for reviewing their booking and invoice status in the application. SMS, push notifications, and a persistent notification center are not part of the pilot.",
    ],
  },
];

export const CUSTOMER_BOOKING_TERMS_SECTIONS: HourlyTermsSection[] = [
  {
    title: "Customer indemnification",
    body: [MASTER_SECTIONS.find((section) => section.number === "5")!.body[1]],
  },
  ...HOURLY_TERMS_SECTIONS.filter((section) => section.title !== "Provider fee"),
  {
    title: "Fixed quotes and deposits",
    body: [
      "Supported quote services require at least one job photo and 12 hours' notice. The customer requests a date and Morning, Afternoon, or Either rather than an exact start time.",
      "The provider has exactly two hours to set an exact start and send one final quote, or may offer one to three other date windows. Choosing a provider-offered window sends the saved request back with a fresh two-hour response period; either party may instead decline.",
      "The final quote is immutable. Accepting it charges a 20% deposit that College Crew holds and credits against the final invoice; the fixed remaining 80% is due after the job.",
      "Quote payment is due at the earlier of 24 hours after the quote is sent or 6 hours before the scheduled start. A late successful payment is refunded and does not revive an expired booking.",
      "The remaining quote balance uses the same 24-hour invoice review, saved-method autocharge, cash settlement, recovery, dispute, cancellation, and provider payout process as hourly work.",
    ],
  },
];

export const PROVIDER_TERMS_SECTIONS: HourlyTermsSection[] = [
  {
    title: MASTER_SECTIONS.find((section) => section.number === "2")!.title,
    body: MASTER_SECTIONS.find((section) => section.number === "2")!.body,
  },
  {
    title: "Provider indemnification",
    body: [MASTER_SECTIONS.find((section) => section.number === "5")!.body[0]],
  },
  HOURLY_TERMS_SECTIONS.find((section) => section.title === "Provider fee")!,
  {
    title: "Provider booking responsibilities",
    body: [
      "The provider may accept or decline a booking request.",
      "After arriving and completing the work, the provider submits actual billable time and any required over-estimate explanation.",
      "Before arrival, a provider cancellation returns all captured booking payments to the original payment method.",
    ],
  },
];

export const HOURLY_PAYMENT_AUTHORIZATION =
  "I authorize College Crew to charge the displayed first-hour amount now. I also authorize College Crew and Stripe to save this payment method for this booking only and to charge the remaining approved invoice balance. If I do not confirm or dispute the invoice, College Crew may attempt the remaining balance 24 hours after the provider submits the invoice. The final amount is based on the provider's hourly rate and submitted billable time, subject to the one-hour minimum, 15-minute billing increments, and the dispute process.";

export const BOOKING_FIXED_SCAFFOLD = [
  "By confirming this booking, you acknowledge that you have read and understood the risk disclosures below, specific to the service category selected. This acknowledgment supplements and is incorporated into the Master Service Agreement.",
] as const;

export const BOOKING_CONSENT_LABEL =
  "I have read and accept these risks for this booking.";

export const QUOTE_PAYMENT_CONSENT_LABEL =
  "I accept the booking risks and authorize a 20% deposit now, with the fixed remaining balance due after the job.";

export const QUOTE_PAYMENT_TERMS = [
  "The provider's optional average quote is informational and is not a price promise.",
  "The final flat quote shown at checkout is immutable and is the complete service price authorized for this booking. College Crew does not add a separate customer platform fee.",
  "College Crew charges 20% of the final quote as a deposit when the customer accepts it, holds the captured funds on the platform, and credits that deposit against the invoice after the job.",
  "The fixed remaining 80% is due after the job through the same invoice review, dispute, payment recovery, cash-settlement, and payout process used for hourly work.",
  "The quote must be paid by the earlier of 24 hours after it is sent or 6 hours before the scheduled start; a late successful payment is refunded and does not revive an expired booking.",
  "At least one job photo is required with a quote request; additional images or video shared in the private booking chat may also be used to prepare the quote. Sending a quote request does not create a charge.",
] as const;

export const GENERAL_FAMILY_DISCLOSURE = [
  "In addition to the category-specific representations above, Family agrees to disclose, prior to each booking, any condition on the property or within the household that a reasonable person would consider relevant to Student's safety.",
] as const;

export const SERVICE_RISK_ADDENDA: Record<string, ServiceRiskAddendum> = {
  "lawn-yard-care": {
    title: "Lawn & Yard Care",
    source: "pdf",
    body: [
      "This service may involve the operation of mowers, trimmers, blowers, and other yard equipment; uneven terrain; and hidden property hazards such as holes, irrigation heads, or debris. Family represents that the yard is free of undisclosed hazards not otherwise communicated to Student prior to the booking.",
    ],
  },
  babysitting: {
    title: "Babysitting",
    source: "pdf",
    body: [
      "This service involves the care of a minor child. Family, as the contracting party, assumes the risks described in this Addendum on Family's own behalf. This Addendum does not, and cannot, waive any legal claim belonging to the minor child. Family agrees to disclose all relevant medical information, allergies, and emergency contacts prior to the booking. College Crew does not verify childcare certifications (including CPR or first aid) beyond what is stated in Section 3 of the Master Agreement unless a Student's profile expressly states otherwise.",
    ],
  },
  "house-management": {
    title: "House Manager",
    source: "pdf",
    body: [
      "This service may involve a range of household tasks as agreed between Family and Student at the time of booking, which may include organizing, light household equipment operation, package handling, or coordinating other service providers. Family and Student should confirm the specific scope of tasks in the booking details; College Crew's liability protections extend only to tasks disclosed and agreed upon at booking. Family represents that any equipment or systems Student will access are in safe working condition.",
    ],
  },
  "window-washing": {
    title: "Window Washing",
    source: "pdf",
    body: [
      "This service may involve the use of ladders, extension poles, or other equipment, and may include work at height on upper-story or exterior windows. Family represents that all areas where work will be performed are structurally sound and free of undisclosed hazards.",
    ],
  },
  "pressure-washing": {
    title: "Power Washing",
    source: "pdf",
    body: [
      "This service involves the operation of pressure-washing equipment capable of causing injury or surface damage, and may involve use of cleaning chemicals and proximity to electrical outlets or fixtures. Family represents that the surfaces to be cleaned and surrounding areas have been accurately described, including any known damage, fragile materials, or electrical hazards.",
    ],
  },
  "pet-care": {
    title: "Dog Walking & Pet Sitting",
    source: "drafted",
    body: [
      "This service may involve unpredictable animal behavior, including the risk of bites, scratches, property damage, escape, leash or containment failure, and encounters with third parties or other animals. If pet sitting occurs inside or around Family's residence, Family represents that all access instructions, containment requirements, medications, feeding instructions, temperament issues, and any history of aggression or biting have been accurately and fully disclosed prior to booking.",
    ],
  },
  tutoring: {
    title: "Tutoring",
    source: "drafted",
    body: [
      "This service may involve one-on-one instruction, academic coaching, or supervised learning with a Student, and may occur in the Family's home, online, or another agreed location. Family represents that the tutoring location is safe and appropriate, that a responsible adult will remain reachable during any session involving a minor, and that any relevant learning needs, behavioral considerations, allergies, access rules, or household conditions have been disclosed before the booking.",
    ],
  },
  hauling: {
    title: "Hauling & Junk Removal",
    source: "drafted",
    body: [
      "This service may involve lifting, carrying, loading, unloading, stairs, driveways, vehicles, tools, debris, sharp edges, heavy or unstable items, and potential damage to walls, floors, fixtures, vehicles, or property. Family represents that all items to be moved or removed have been accurately described, that no hazardous, illegal, biohazardous, or undisclosed materials are included, and that the work area is safe and accessible before the booking begins.",
    ],
  },
  "youth-sports-coaching": {
    title: "Youth Sports Coaching",
    source: "drafted",
    body: [
      "This service may involve physical activity by a minor, including running, drills, sports equipment, outdoor conditions, collisions, falls, overexertion, or aggravation of a prior injury. Family, as the contracting party, assumes the risks described in this Addendum on Family's own behalf. This Addendum does not, and cannot, waive any legal claim belonging to the minor child. Family represents that all relevant medical conditions, allergies, emergency contacts, supervision expectations, and activity limits have been disclosed before the booking. College Crew does not verify coaching, first-aid, or CPR certifications beyond what is stated in Section 3 of the Master Agreement unless a Student's profile expressly states otherwise.",
    ],
  },
};

export function getMasterSections(role: UserRole) {
  return MASTER_SECTIONS.filter(
    (section) => section.appliesTo === "all" || role === "provider",
  );
}

export function getMasterAgreementSnapshot(role: UserRole) {
  return {
    version: LEGAL_CONTENT_VERSION,
    role,
    intro: [...MASTER_INTRO],
    sections: getMasterSections(role).map((section) => ({
      number: section.number,
      title: section.title,
      body: section.body,
    })),
    hourlyTerms: {
      intro: [...HOURLY_TERMS_INTRO],
      sections: HOURLY_TERMS_SECTIONS.map((section) => ({
        title: section.title,
        body: section.body,
      })),
    },
  };
}

export function getPlatformTermsSnapshot() {
  return {
    kind: "platform_terms" as const,
    version: PLATFORM_TERMS_VERSION,
    intro: [...MASTER_INTRO],
    sections: PLATFORM_TERMS_SECTIONS.map((section) => ({
      number: section.number,
      title: section.title,
      body: section.body,
    })),
  };
}

export function getCustomerBookingTermsSnapshot() {
  return {
    kind: "customer_booking_terms" as const,
    version: CUSTOMER_BOOKING_TERMS_VERSION,
    intro: [...HOURLY_TERMS_INTRO],
    sections: CUSTOMER_BOOKING_TERMS_SECTIONS.map((section) => ({
      title: section.title,
      body: section.body,
    })),
  };
}

export function getProviderTermsSnapshot() {
  return {
    kind: "provider_terms" as const,
    version: PROVIDER_TERMS_VERSION,
    intro: [
      "These Provider Terms supplement the Master Service Agreement and apply when a User offers or performs services through College Crew.",
    ],
    sections: PROVIDER_TERMS_SECTIONS.map((section) => ({
      title: section.title,
      body: section.body,
    })),
  };
}

export function getLegalDocumentSnapshot(kind: LegalDocumentKind) {
  if (kind === "platform_terms") return getPlatformTermsSnapshot();
  if (kind === "customer_booking_terms") {
    return getCustomerBookingTermsSnapshot();
  }
  return getProviderTermsSnapshot();
}

export function getServiceRiskAddendum(serviceSlug: string) {
  return SERVICE_RISK_ADDENDA[serviceSlug] ?? null;
}

export function getBookingRiskSnapshot(input: {
  serviceSlug: string;
  serviceName: string;
  scheduledAt: string;
  address: string;
  providerName: string;
  customerName: string;
}) {
  const risk = getServiceRiskAddendum(input.serviceSlug);
  if (!risk) return null;

  return {
    version: BOOKING_RISK_VERSION,
    fixedScaffold: [...BOOKING_FIXED_SCAFFOLD],
    variableFields: {
      serviceType: input.serviceName,
      dateTime: input.scheduledAt,
      jobAddress: input.address,
      student: input.providerName,
      family: input.customerName,
    },
    serviceRisk: {
      serviceSlug: input.serviceSlug,
      title: risk.title,
      source: risk.source,
      body: risk.body,
    },
    generalFamilyDisclosure: [...GENERAL_FAMILY_DISCLOSURE],
    consentLabel: BOOKING_CONSENT_LABEL,
  };
}

export function getQuoteBookingRiskSnapshot(input: {
  bookingId: string;
  finalQuoteCents: number;
  serviceSlug: string;
  serviceName: string;
  scheduledAt: string;
  address: string;
  providerName: string;
  customerName: string;
}) {
  const base = getBookingRiskSnapshot(input);
  if (!base) return null;

  return {
    ...base,
    version: QUOTE_BOOKING_RISK_VERSION,
    quoteTerms: {
      bookingId: input.bookingId,
      finalQuoteCents: input.finalQuoteCents,
      pricing: "final_flat_quote" as const,
      body: [...QUOTE_PAYMENT_TERMS],
    },
    consentLabel: QUOTE_PAYMENT_CONSENT_LABEL,
  };
}

export function getPaymentAuthorizationSnapshot(input: {
  version: string;
  bookingId: string;
  firstHourCents: number;
  estimatedTotalCents: number;
  estimatedBalanceCents: number;
  dueAt: string;
}) {
  return {
    kind: "payment_authorization" as const,
    version: input.version,
    bookingId: input.bookingId,
    text: HOURLY_PAYMENT_AUTHORIZATION,
    amounts: {
      firstHourCents: input.firstHourCents,
      estimatedTotalCents: input.estimatedTotalCents,
      estimatedBalanceCents: input.estimatedBalanceCents,
    },
    dueAt: input.dueAt,
    scope: "booking_only" as const,
  };
}

export function getBookingAddendumSnapshot(input: {
  serviceSlug: string;
  serviceName: string;
  scheduledAt: string;
  address: string;
  providerName: string;
  customerName: string;
  includeHourlyTerms?: boolean;
}) {
  const risk = getServiceRiskAddendum(input.serviceSlug);
  if (!risk) return null;

  return {
    version: LEGAL_CONTENT_VERSION,
    fixedScaffold: [...BOOKING_FIXED_SCAFFOLD],
    variableFields: {
      serviceType: input.serviceName,
      dateTime: input.scheduledAt,
      jobAddress: input.address,
      student: input.providerName,
      family: input.customerName,
    },
    serviceRisk: {
      serviceSlug: input.serviceSlug,
      title: risk.title,
      source: risk.source,
      body: risk.body,
    },
    generalFamilyDisclosure: [...GENERAL_FAMILY_DISCLOSURE],
    ...(input.includeHourlyTerms
      ? {
          hourlyTerms: {
            intro: [...HOURLY_TERMS_INTRO],
            sections: HOURLY_TERMS_SECTIONS.map((section) => ({
              title: section.title,
              body: section.body,
            })),
          },
          paymentAuthorization: HOURLY_PAYMENT_AUTHORIZATION,
        }
      : {}),
    consentLabel: BOOKING_CONSENT_LABEL,
  };
}
