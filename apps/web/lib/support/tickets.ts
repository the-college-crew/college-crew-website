import type {
  SupportTicketCategory,
  SupportTicketSentiment,
  SupportTicketStatus,
} from "@/lib/db/types";

export const SUPPORT_CATEGORIES: ReadonlyArray<{
  value: SupportTicketCategory;
  label: string;
  description: string;
}> = [
  {
    value: "website",
    label: "Website bug or usability",
    description: "Something is broken, confusing, or harder than it should be.",
  },
  {
    value: "feature_or_service",
    label: "Feature or service idea",
    description: "A capability or local service you would like College Crew to add.",
  },
  {
    value: "booking_or_job",
    label: "Booking or job help",
    description: "Help with a request, appointment, customer, or provider.",
  },
  {
    value: "account_or_payment",
    label: "Account or payment",
    description: "Questions about your account, a charge, or a payout.",
  },
  {
    value: "safety_or_trust",
    label: "Safety or trust",
    description: "A concern about safety, verification, conduct, or reliability.",
  },
  {
    value: "other",
    label: "Something else",
    description: "Anything that does not fit the options above.",
  },
];

export const SUPPORT_SENTIMENTS: ReadonlyArray<{
  value: SupportTicketSentiment;
  label: string;
}> = [
  { value: "positive", label: "Positive" },
  { value: "neutral", label: "Neutral" },
  { value: "frustrated", label: "Frustrated" },
];

export const SUPPORT_STATUS_LABELS: Record<SupportTicketStatus, string> = {
  new: "New",
  reviewing: "Reviewing",
  resolved: "Resolved",
};

export const SUPPORT_CATEGORY_LABELS = Object.fromEntries(
  SUPPORT_CATEGORIES.map(({ value, label }) => [value, label]),
) as Record<SupportTicketCategory, string>;

export const SUPPORT_SENTIMENT_LABELS = Object.fromEntries(
  SUPPORT_SENTIMENTS.map(({ value, label }) => [value, label]),
) as Record<SupportTicketSentiment, string>;

