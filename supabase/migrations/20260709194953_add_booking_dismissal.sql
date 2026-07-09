-- A customer can dismiss a declined request from their dashboard without
-- deleting the booking record or changing its state-machine status.
alter table public.bookings
  add column dismissed_at timestamptz;

-- Preserve the existing restricted update surface while allowing the customer
-- dashboard's dismissal action to set its own timestamp.
grant update (status, dismissed_at) on table public.bookings to authenticated;
