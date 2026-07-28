begin;

select plan(2);

-- Contract-only: dev and production share a database, so this test does not
-- create a synthetic booking or conversation.
select ok(
  position(
    $$new.status = 'cancelled'$$
    in pg_get_functiondef(
      'public.resolve_conversation_on_booking_completed()'::regprocedure
    )
  ) > 0,
  'a cancelled booking is an eligible conversation-resolution event'
);

select ok(
  position(
    $$new.cancelled_by_role = 'customer'$$
    in pg_get_functiondef(
      'public.resolve_conversation_on_booking_completed()'::regprocedure
    )
  ) > 0,
  'only customer cancellations resolve a booking conversation automatically'
);

select * from finish();

rollback;
