-- PostgreSQL requires newly added enum values to commit before a later
-- migration can use them in constraints, policies, indexes, or functions.

alter type public.legal_acceptance_kind add value if not exists 'platform_terms';
alter type public.legal_acceptance_kind add value if not exists 'customer_booking_terms';
alter type public.legal_acceptance_kind add value if not exists 'provider_terms';
alter type public.legal_acceptance_kind add value if not exists 'payment_authorization';
