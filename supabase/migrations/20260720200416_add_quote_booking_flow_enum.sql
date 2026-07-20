-- PostgreSQL requires a newly added enum value to be committed before another
-- migration can safely reference it in constraints and functions.
alter type public.booking_flow add value if not exists 'quote_v1';
