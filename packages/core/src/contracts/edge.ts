import { z } from "zod";

/**
 * Edge Function request/response contracts (arch A-4). The canonical wire
 * shapes for every user-invoked function, consumed by the mobile app (and
 * web, if it adopts the functions) for typed calls.
 *
 * NOTE: the Deno functions cannot import this package yet (workspace code
 * isn't reachable from the functions bundle until the packages/db import-map
 * wiring lands), so each function re-validates its tiny request inline.
 * These schemas are the contract of record — a function change that diverges
 * from this file is a bug.
 *
 * Every function error is the typed envelope below with an HTTP error status:
 *   401 not_signed_in    — missing/invalid JWT
 *   404 not_found        — booking missing OR caller isn't authorized to see it
 *   409 <state codes>    — wrong flow/status/window (see per-function codes)
 *   402 card_declined    — settle-booking hard decline (recoverable)
 *   503 unconfigured     — Stripe/provider not set up in this environment
 */

export const edgeErrorEnvelopeSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
  }),
});
export type EdgeErrorEnvelope = z.infer<typeof edgeErrorEnvelopeSchema>;

/** Mirrors public.booking_status (lib/db/types.ts is the source of truth). */
export const bookingStatusSchema = z.enum([
  "requested",
  "accepted",
  "booked",
  "in_progress",
  "invoice_review",
  "disputed",
  "paid",
  "completed",
  "declined",
  "withdrawn",
  "expired",
  "cancelled",
]);
export type BookingStatusValue = z.infer<typeof bookingStatusSchema>;

// ---------------------------------------------------------------------------
// create-payment-sheet — first-hour PaymentSheet bootstrap (hourly_v1 only).
// Caller must be the booking's customer, the booking `accepted` with an open
// payment window, and BOTH legal acceptances (booking_addendum +
// payment_authorization) already recorded via RLS inserts — the function
// verifies they exist but never generates their content.
// Extra codes: unsupported_flow, wrong_status, payment_window_closed,
// missing_terms, acceptance_required, begin_failed, attach_failed.
// ---------------------------------------------------------------------------

export const createPaymentSheetRequestSchema = z.object({
  bookingId: z.uuid(),
});
export type CreatePaymentSheetRequest = z.infer<
  typeof createPaymentSheetRequestSchema
>;

export const createPaymentSheetResponseSchema = z.object({
  clientSecret: z.string(),
  ephemeralKey: z.string(),
  customerId: z.string(),
  publishableKey: z.string(),
  /** First-hour charge amount, from the DB payment row — display only. */
  amountCents: z.number().int().nonnegative(),
});
export type CreatePaymentSheetResponse = z.infer<
  typeof createPaymentSheetResponseSchema
>;

// ---------------------------------------------------------------------------
// settle-booking — remaining-balance settlement during invoice_review
// (hourly_v1). `confirm` mirrors the web one-click saved-method charge; when
// the bank demands authentication (or after a decline) the caller re-invokes
// with `recover` and mounts PaymentSheet with the returned bundle.
// Extra codes: unsupported_flow, wrong_status, no_invoice, no_balance_due,
// begin_failed, attach_failed, card_declined.
// ---------------------------------------------------------------------------

export const settleBookingRequestSchema = z.object({
  bookingId: z.uuid(),
  mode: z.enum(["confirm", "recover"]).default("confirm"),
});
export type SettleBookingRequest = z.infer<typeof settleBookingRequestSchema>;

export const settleBookingResponseSchema = z.discriminatedUnion("outcome", [
  /** Zero balance settled with no charge; booking completes via the RPC. */
  z.object({ outcome: z.literal("settled") }),
  /** Saved-method charge confirmed; the webhook completes the booking. */
  z.object({ outcome: z.literal("processing") }),
  /** Mount PaymentSheet with this bundle (authentication or recovery). */
  z.object({
    outcome: z.literal("payment_sheet_required"),
    clientSecret: z.string(),
    customerId: z.string(),
    ephemeralKey: z.string(),
    publishableKey: z.string(),
  }),
]);
export type SettleBookingResponse = z.infer<typeof settleBookingResponseSchema>;

// ---------------------------------------------------------------------------
// reconcile-payment — post-PaymentSheet launch sweep (P-4). Re-reads the
// booking's live PaymentIntent state from Stripe and applies the same
// idempotent settlement RPCs the webhook uses, so a cold-started app never
// waits on webhook latency. Caller must be a booking participant.
// ---------------------------------------------------------------------------

export const reconcilePaymentRequestSchema = z.object({
  bookingId: z.uuid(),
});
export type ReconcilePaymentRequest = z.infer<
  typeof reconcilePaymentRequestSchema
>;

export const reconcilePaymentResponseSchema = z.object({
  status: bookingStatusSchema,
});
export type ReconcilePaymentResponse = z.infer<
  typeof reconcilePaymentResponseSchema
>;

// ---------------------------------------------------------------------------
// issue-edu-otp — send (or resend) the 6-digit .edu verification code for
// provider onboarding. Caller must be signed in; the address must be a .edu
// not already verified by another account. The code is emailed and stored only
// as sha256(`${userId}:${code}`); a 15-minute TTL and 60-second resend
// cooldown apply.
// Codes: bad_request (not a .edu), email_taken (409), cooldown (429),
// send_failed (502), begin_failed (409), unconfigured (503).
// ---------------------------------------------------------------------------

export const issueEduOtpRequestSchema = z.object({
  schoolEmail: z
    .email()
    .transform((value) => value.trim().toLowerCase())
    .refine((value) => value.endsWith(".edu"), {
      message: "Use your school email; it must end in .edu.",
    }),
});
export type IssueEduOtpRequest = z.infer<typeof issueEduOtpRequestSchema>;

export const issueEduOtpResponseSchema = z.object({ ok: z.literal(true) });
export type IssueEduOtpResponse = z.infer<typeof issueEduOtpResponseSchema>;

// ---------------------------------------------------------------------------
// verify-edu-otp — redeem the code issued above and record the verified .edu.
// The expected failure states are typed error envelopes, not a boolean, so the
// mobile client can act on each: no_pending_code (409), code_expired (409),
// too_many_attempts (429, ceiling 5), invalid_code (401, attempt consumed),
// email_taken (409). A 200 always means verified.
// ---------------------------------------------------------------------------

export const verifyEduOtpRequestSchema = z.object({
  code: z.string().trim().regex(/^\d{6}$/),
});
export type VerifyEduOtpRequest = z.infer<typeof verifyEduOtpRequestSchema>;

export const verifyEduOtpResponseSchema = z.object({ verified: z.literal(true) });
export type VerifyEduOtpResponse = z.infer<typeof verifyEduOtpResponseSchema>;

// ---------------------------------------------------------------------------
// update-profile-text — the write path for a provider's public storefront text
// (display_name, bio, company_name). The UPDATE grant on those columns was
// revoked from `authenticated` (migration 20260713165821) so the browser/mobile
// cannot write them directly — this function is the only path, exactly like
// moderate-message owns the messages write path. Moderation is FLAG-ONLY: the
// text always saves and goes live; a hit just logs profile_moderation_events and
// emails the founders. `moderation` reports whether any submitted field tripped.
// Codes: bad_request (400), not_provider (403, caller has no provider profile),
// save_failed (500), unconfigured (503).
// ---------------------------------------------------------------------------

export const updateProfileTextRequestSchema = z
  .object({
    displayName: z.string().trim().min(1).max(80).optional(),
    bio: z.string().trim().max(2000).optional(),
    companyName: z.string().trim().max(120).optional(),
  })
  .refine(
    (value) =>
      value.displayName !== undefined ||
      value.bio !== undefined ||
      value.companyName !== undefined,
    { message: "Provide at least one field to update." },
  );
export type UpdateProfileTextRequest = z.infer<
  typeof updateProfileTextRequestSchema
>;

export const updateProfileTextResponseSchema = z.object({
  ok: z.literal(true),
  moderation: z.enum(["clean", "flagged"]),
});
export type UpdateProfileTextResponse = z.infer<
  typeof updateProfileTextResponseSchema
>;

// ---------------------------------------------------------------------------
// DRAFT contracts — functions not yet built (subject to change when each is
// implemented; keep this file updated in the same PR that builds them).
// ---------------------------------------------------------------------------

/** send-push — internal fan-out (DB webhook w/ shared secret; never client-called). */
export const sendPushRequestSchema = z.object({
  userId: z.uuid(),
  kind: z.string().min(1).max(60),
  payload: z.record(z.string(), z.unknown()),
});
export const sendPushResponseSchema = z.object({ ok: z.literal(true) });
