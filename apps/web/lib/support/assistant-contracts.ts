import { z } from "zod";

export const MAX_SUPPORT_MESSAGES = 24;
export const MAX_SUPPORT_TRANSCRIPT_CHARS = 24_000;

export const supportMessageSchema = z.discriminatedUnion("role", [
  z.object({ role: z.literal("user"), content: z.string().trim().min(1).max(2_000) }),
  z.object({ role: z.literal("assistant"), content: z.string().trim().min(1).max(8_000) }),
]);

export const supportAssistantRequestSchema = z
  .object({
    sourcePath: z
      .string()
      .max(500)
      .regex(/^\/(?!\/)[^?#]*$/, "Use an app pathname without a query or fragment."),
    messages: z.array(supportMessageSchema).min(1).max(MAX_SUPPORT_MESSAGES),
  })
  .superRefine(({ messages }, ctx) => {
    const total = messages.reduce((sum, message) => sum + message.content.length, 0);
    if (total > MAX_SUPPORT_TRANSCRIPT_CHARS) {
      ctx.addIssue({ code: "custom", path: ["messages"], message: "Transcript is too long." });
    }
    if (messages.at(-1)?.role !== "user") {
      ctx.addIssue({ code: "custom", path: ["messages"], message: "The final message must be from the user." });
    }
    messages.forEach((message, index) => {
      const expected = index % 2 === 0 ? "user" : "assistant";
      if (message.role !== expected) {
        ctx.addIssue({ code: "custom", path: ["messages", index, "role"], message: "Messages must alternate, starting with the user." });
      }
    });
  });

export const safeNavigationActionKeys = [
  "dashboard", "provider_dashboard", "provider_onboarding", "provider_settings",
  "browse", "messages", "login",
] as const;
export type SafeNavigationActionKey = (typeof safeNavigationActionKeys)[number];

export type SafeNavigationAction = {
  key: SafeNavigationActionKey;
  label: string;
  href: string;
};

export type SupportPageContext = {
  category: "public" | "provider_onboarding" | "provider" | "customer_dashboard" | "booking" | "messages";
  provider?: {
    nextStep: string;
    verification: string;
    missingRequirements: string[];
    agreementAccepted: boolean;
    payoutReady: boolean;
  };
  bookings?: Array<{
    status: string;
    flow: string;
    service: string;
    provider: string;
    scheduledAt: string | null;
    paymentDeadline: string | null;
    amountCents: number;
    invoiceStatus: string | null;
    invoiceBalanceCents: number | null;
    disputeStatus: string | null;
  }>;
};

export type SupportStreamEvent =
  | { type: "meta"; actions: SafeNavigationAction[] }
  | { type: "delta"; text: string }
  | { type: "done" }
  | { type: "error"; code: "unavailable" | "timeout" | "interrupted" };

export type SupportMessage = z.infer<typeof supportMessageSchema>;
