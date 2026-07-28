-- Close out the job-photos cutover by removing the pre-photo overload.
--
-- 20260727120000 deliberately ADDED the 12-arg create_quote_booking_request
-- alongside the original 11-arg one, so the migration could be applied while
-- the old code was still serving traffic. Both then coexisted unambiguously:
-- an 11-named-arg call could only match the old signature, a 12-arg call only
-- the new one.
--
-- The new code is deployed and sends p_job_photos, so the old signature has no
-- legitimate caller left. It is dropped here because leaving it in place is a
-- live hole: it is granted to `authenticated`, so anyone with a session could
-- POST /rest/v1/rpc/create_quote_booking_request with the original 11 arguments
-- and create a quote_v1 booking carrying no job photos at all, defeating the
-- requirement the rest of that migration exists to enforce.
--
-- After this runs, exactly one overload remains and photos are mandatory on
-- every path into a quote request.

drop function if exists public.create_quote_booking_request(
  uuid, timestamptz, integer, integer, text, text, text, text, text,
  double precision, double precision
);
