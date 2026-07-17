import { z } from "zod";

const supportCategory = z.enum([
  "website",
  "feature_or_service",
  "booking_or_job",
  "account_or_payment",
  "safety_or_trust",
  "other",
]);

const supportSentiment = z.enum(["positive", "neutral", "frustrated"]);

export const supportTicketSchema = z
  .object({
    category: supportCategory,
    sentiment: z.preprocess(
      (value) => (value === "" || value == null ? undefined : value),
      supportSentiment.optional(),
    ),
    message: z
      .string()
      .trim()
      .min(10, "Please share at least 10 characters.")
      .max(5000, "Please keep your message under 5,000 characters."),
    wantsReply: z.boolean(),
    contactEmail: z.preprocess(
      (value) =>
        typeof value === "string" && value.trim() === ""
          ? undefined
          : value,
      z
        .email("Enter a valid reply email.")
        .trim()
        .max(320, "Email is too long.")
        .optional(),
    ),
    sourcePath: z.preprocess(
      (value) => (value === "" || value == null ? undefined : value),
      z
        .string()
        .max(500)
        .regex(
          /^\/(?!\/)[^?#]*$/,
          "The source page must be a local pathname without a query or fragment.",
        )
        .optional(),
    ),
  })
  .superRefine((value, context) => {
    if (value.wantsReply && !value.contactEmail) {
      context.addIssue({
        code: "custom",
        path: ["contactEmail"],
        message: "Add an email so we can respond.",
      });
    }
  });

export const supportTicketStatusSchema = z.enum([
  "new",
  "reviewing",
  "resolved",
]);

export type SupportFormState = {
  success: boolean;
  message?: string;
  errors?: Partial<
    Record<
      "category" | "sentiment" | "message" | "contactEmail" | "sourcePath",
      string[]
    >
  >;
};

export const INITIAL_SUPPORT_FORM_STATE: SupportFormState = {
  success: false,
};
