-- Quote-v2 deposits use their own authorization contract. The existing policy
-- only permits the hourly first-hour version, which causes the customer-owned
-- consent insert to be rejected by RLS before a Stripe PaymentIntent is made.
drop policy if exists "Users insert their own legal acceptances"
  on public.legal_acceptances;

create policy "Users insert their own legal acceptances"
  on public.legal_acceptances for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid()) and p.role <> 'admin'
    )
    and (
      (
        kind in ('platform_terms', 'customer_booking_terms')
        and role = 'customer'
        and booking_id is null
        and private.matches_current_legal_document(
          kind, version, content_hash
        )
      )
      or (
        kind = 'provider_terms'
        and role = 'provider'
        and booking_id is null
        and private.has_provider_capability((select auth.uid()))
        and private.matches_current_legal_document(
          kind, version, content_hash
        )
      )
      or (
        kind = 'booking_addendum'
        and role = 'customer'
        and exists (
          select 1
          from public.bookings b
          where b.id = legal_acceptances.booking_id
            and b.customer_id = (select auth.uid())
            and b.status = 'accepted'
        )
      )
      or (
        kind = 'payment_authorization'
        and role = 'customer'
        and version = 'hourly-v1-saved-method-2026-07-15'
        and snapshot ->> 'kind' = 'payment_authorization'
        and snapshot ->> 'version' = version
        and snapshot ->> 'bookingId' = booking_id::text
        and snapshot ->> 'scope' = 'booking_only'
        and snapshot ->> 'text' =
          'I authorize College Crew to charge the displayed first-hour amount now. I also authorize College Crew and Stripe to save this payment method for this booking only and to charge the remaining approved invoice balance. If I do not confirm or dispute the invoice, College Crew may attempt the remaining balance 24 hours after the provider submits the invoice. The final amount is based on the provider''s hourly rate and submitted billable time, subject to the one-hour minimum, 15-minute billing increments, and the dispute process.'
        and exists (
          select 1
          from public.bookings b
          where b.id = legal_acceptances.booking_id
            and b.customer_id = (select auth.uid())
            and b.booking_flow = 'hourly_v1'
            and b.status = 'accepted'
            and (snapshot -> 'amounts' ->> 'firstHourCents')::integer =
              b.hourly_rate_cents_snapshot
            and (snapshot -> 'amounts' ->> 'estimatedTotalCents')::integer =
              ((b.hourly_rate_cents_snapshot::bigint * b.estimated_minutes + 30) / 60)::integer
            and (snapshot -> 'amounts' ->> 'estimatedBalanceCents')::integer =
              ((b.hourly_rate_cents_snapshot::bigint * b.estimated_minutes + 30) / 60)::integer
              - b.hourly_rate_cents_snapshot
            and (snapshot ->> 'dueAt')::timestamptz = b.initial_payment_due_at
        )
      )
      or (
        kind = 'payment_authorization'
        and role = 'customer'
        and version = 'quote-v2-20pct-deposit'
        and snapshot ->> 'version' = version
        and snapshot ->> 'bookingId' = booking_id::text
        and snapshot ->> 'savedMethodScope' = 'booking_only'
        and (snapshot ->> 'remainingBalanceAfterJob')::boolean
        and exists (
          select 1
          from public.bookings b
          where b.id = legal_acceptances.booking_id
            and b.customer_id = (select auth.uid())
            and b.booking_flow = 'quote_v2'
            and b.status = 'accepted'
            and b.customer_authorization_version = version
            and (snapshot ->> 'quoteTotalCents')::integer = b.price_cents
            and (snapshot ->> 'depositCents')::integer = b.upfront_payment_cents
            and (snapshot ->> 'remainingBalanceCents')::integer =
              b.price_cents - b.upfront_payment_cents
            and (snapshot ->> 'dueAt')::timestamptz = b.initial_payment_due_at
        )
      )
    )
  );
