-- Instant-book uses a flat 2h response window. The plpgsql validation in
-- create_hourly_booking_request_unchecked already allows it; this table CHECK
-- was still pinned to the old preset list and rejected every new booking.
-- Applied to the shared project via MCP apply_migration on 2026-07-22.
alter table public.bookings drop constraint if exists bookings_response_window_valid;
alter table public.bookings add constraint bookings_response_window_valid
  check (
    response_window_hours is null
    or response_window_hours = any (array[1, 2, 3, 5, 12, 24, 48, 72])
  );
