-- Cash settlement, part 1 of 2: enum value only (must commit before use).
--
-- A job settled in person is neither 'paid' (the platform never collected the
-- balance) nor 'waived' (nobody forgave it) — recording it as either would make
-- the books lie. It gets its own status.
alter type public.booking_invoice_status add value if not exists 'cash_settled';
