-- Drop the obsolete post-accept payment-deadline invariant.
--
-- `bookings_initial_payment_deadline_valid` (added 2026-07-13) required that the
-- instant `accepted_at` is set, `initial_payment_due_at` must also be set to
-- LEAST(accepted_at + 12h, scheduled_at). That matched the old two-stage flow
-- where accept scheduled a separate payment deadline.
--
-- The instant-book rewrite (20260722100300) retired that deadline stage: accept
-- now sets only `accepted_at` and captures the first-hour hold immediately, so
-- `initial_payment_due_at` stays NULL. With the constraint still in place, every
-- accept violated it ("new row for relation \"bookings\" violates check
-- constraint \"bookings_initial_payment_deadline_valid\"") and no hourly request
-- could be accepted. Drop the now-meaningless invariant.
--
-- `bookings_initial_payment_before_start` stays: it only asserts
-- initial_payment_due_at <= scheduled_at when set, and is a no-op when NULL.

alter table public.bookings
  drop constraint if exists bookings_initial_payment_deadline_valid;
