-- Clean up advisor warnings introduced by the legal_acceptances policies:
-- use initplan-friendly auth.uid() calls and one INSERT policy.

drop policy if exists "Users and admins read legal acceptances"
  on public.legal_acceptances;

drop policy if exists "Users accept current master agreement for themselves"
  on public.legal_acceptances;

drop policy if exists "Customers accept risk addendum for their own bookings"
  on public.legal_acceptances;

create policy "Users and admins read legal acceptances"
  on public.legal_acceptances for select to authenticated
  using (
    user_id = (select auth.uid())
    or (select public.is_admin())
  );

create policy "Users insert their own legal acceptances"
  on public.legal_acceptances for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (
      (
        kind = 'master_agreement'
        and booking_id is null
        and exists (
          select 1
          from public.profiles p
          where p.id = (select auth.uid())
            and p.role = legal_acceptances.role
        )
      )
      or
      (
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
    )
  );
