-- Arms the provider payout.
--
-- APPLY THIS ONLY AFTER the booking-scheduler edge function is redeployed with
-- the 'provider_payout' handler:
--
--   npx supabase functions deploy booking-scheduler --use-api
--
-- The live scheduler is the edge function. Until it knows the new job kind it
-- rejects those jobs as UnknownAutomationKind, which burns the retry budget and
-- raises founder alerts. Everything else in 20260724120000 is dormant without
-- this trigger, so the schema can land safely ahead of the deploy.
--
-- To disarm: drop trigger queue_provider_payout on public.bookings;

drop trigger if exists queue_provider_payout on public.bookings;
create trigger queue_provider_payout
  after update of status on public.bookings
  for each row
  execute function private.queue_provider_payout();
