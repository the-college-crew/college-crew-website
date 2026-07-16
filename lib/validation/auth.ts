import { z } from "zod";

import { evaluatePassword } from "@/lib/auth/password-strength";
import { normalizeState } from "@/lib/constants/us-states";

/**
 * Shared auth validation schemas (auth is shared ownership — coordinate
 * changes). These are the single source of truth used by the Server Actions in
 * app/(auth)/actions.ts; the client forms mirror the same rules for inline
 * feedback but the server is authoritative.
 */

export const emailSchema = z
  .string()
  .trim()
  .email("Enter a valid email address.");

/**
 * School email: a valid address on a .edu domain. Used to verify student
 * status separately from the (now personal) login email. Lower-cased so the
 * stored value and the uniqueness index agree.
 */
export const schoolEmailSchema = emailSchema
  .toLowerCase()
  .refine((value) => value.endsWith(".edu"), {
    message: "Use your school email; it must end in .edu.",
  });

/** Six-digit numeric OTP emailed to the .edu address. */
export const otpCodeSchema = z
  .string()
  .trim()
  .regex(/^\d{6}$/, "Enter the 6-digit code from your email.");

/** Password rules live in lib/auth/password-strength so client + server agree. */
export const passwordSchema = z.string().superRefine((value, ctx) => {
  const { acceptable, checks } = evaluatePassword(value);
  if (acceptable) return;

  const message = !checks.length
    ? "Use at least 10 characters."
    : !checks.notCommon
      ? "That password is too common. Pick something less guessable."
      : "Add more variety: mix upper/lowercase, numbers, and symbols.";
  ctx.addIssue({ code: z.ZodIssueCode.custom, message });
});

/** Structured US address. `state` is normalized to a 2-letter code. */
export const addressSchema = z.object({
  address_line1: z.string().trim().min(1, "Enter your street address."),
  address_line2: z.string().trim().default(""),
  city: z.string().trim().min(1, "Enter your city."),
  state: z
    .string()
    .trim()
    .min(1, "Select your state.")
    .transform((value, ctx) => {
      const code = normalizeState(value);
      if (!code) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Pick a US state from the list.",
        });
        return z.NEVER;
      }
      return code;
    }),
  postal_code: z
    .string()
    .trim()
    .regex(/^\d{5}$/, "Enter a 5-digit ZIP code."),
});

/**
 * Date of birth with a real 18+ gate. Used at provider-intent signup and again
 * when an existing account starts provider onboarding (customers never provide
 * one at signup). ID review re-verifies age later.
 */
export const dateOfBirthSchema = z
  .string()
  .trim()
  .min(1, "Enter your date of birth.")
  .refine((value) => !Number.isNaN(Date.parse(value)), {
    message: "Enter a valid date.",
  })
  .refine((value) => ageOnDate(value) >= 18, {
    message: "You must be 18 or older to offer services.",
  })
  .refine((value) => ageOnDate(value) < 120, {
    message: "Enter a valid date of birth.",
  });

/**
 * Starting provider onboarding from an existing account: the only extra facts
 * we need are a date of birth (when the profile doesn't have one yet) and an
 * optional company name.
 */
export const providerStartSchema = z.object({
  dateOfBirth: dateOfBirthSchema.optional(),
  companyName: z.string().trim().max(120).optional(),
});

/** Customer signup: name + credentials + home address. No date of birth. */
export const customerSignUpSchema = z
  .object({
    fullName: z.string().trim().min(1, "Enter your name."),
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string(),
    address_line1: addressSchema.shape.address_line1,
    address_line2: addressSchema.shape.address_line2,
    city: addressSchema.shape.city,
    state: addressSchema.shape.state,
    postal_code: addressSchema.shape.postal_code,
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match.",
    path: ["confirmPassword"],
  });

/**
 * Provider signup: everything the customer sends, plus a date of birth that
 * must be 18+. The .edu check stays in the action (it wants a role-specific
 * error message). ID review re-verifies age later.
 */
export const providerSignUpSchema = z
  .object({
    fullName: z.string().trim().min(1, "Enter your name."),
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string(),
    dateOfBirth: dateOfBirthSchema,
    address_line1: addressSchema.shape.address_line1,
    address_line2: addressSchema.shape.address_line2,
    city: addressSchema.shape.city,
    state: addressSchema.shape.state,
    postal_code: addressSchema.shape.postal_code,
    companyName: z.string().trim().max(120).optional(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match.",
    path: ["confirmPassword"],
  });

export const resetPasswordSchema = z
  .object({
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match.",
    path: ["confirmPassword"],
  });

/** Whole years elapsed from an ISO date string to today. */
export function ageOnDate(isoDate: string, now: Date = new Date()): number {
  const dob = new Date(isoDate);
  let age = now.getFullYear() - dob.getFullYear();
  const monthDelta = now.getMonth() - dob.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && now.getDate() < dob.getDate())) {
    age -= 1;
  }
  return age;
}
