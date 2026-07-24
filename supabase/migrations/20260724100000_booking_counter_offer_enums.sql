-- Time-flexibility + provider counter-offer, part 1 of 2: enum values only.
--
-- `alter type ... add value` must be COMMITTED before the new label can be used,
-- so every column/function that references 'countered' lands in the companion
-- migration (20260724100100). Same split this repo already used when adding the
-- 'authorized' booking_payment_status (20260722100000 -> 20260722100200).

-- Customer's per-booking answer to "may the student propose a different time?".
do $$
begin
  if not exists (select 1 from pg_type where typname = 'booking_time_flexibility') then
    create type public.booking_time_flexibility as enum ('flexible', 'fixed');
  end if;
end$$;

-- The provider proposed a different time and the customer hasn't answered yet.
alter type public.booking_status add value if not exists 'countered';
