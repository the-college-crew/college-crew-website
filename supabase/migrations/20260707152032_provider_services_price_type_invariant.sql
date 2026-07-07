-- Owner: Ari (provider-facing). Coordinated schema change — announce to Zach.
--
-- Enforce at the database what the services-pricing form now validates in the
-- app: a fixed-price offering must have a real price, and a quote never stores
-- one. Prevents the inconsistent (fixed, $0) / (quote, $N) rows that let the
-- onboarding form desync the price/quote controls.
--
-- Safe to add without cleanup: verified 0 existing rows violate this.

alter table public.provider_services
  add constraint provider_services_price_matches_type
  check (
    (price_type = 'fixed' and price_cents > 0)
    or (price_type = 'quote' and price_cents = 0)
  );
