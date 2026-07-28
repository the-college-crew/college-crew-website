-- conversation_resolutions was created with only select/insert/delete for
-- `authenticated`, on the reasoning that a resolution is only ever a whole row
-- added or removed. But the app writes it with supabase-js `.upsert()`, which
-- compiles to INSERT ... ON CONFLICT DO UPDATE — and Postgres checks for the
-- UPDATE privilege up front, whether or not a row actually conflicts. Without
-- it every "Resolve" click failed with a permission error, silently, so the
-- chat never disappeared from the inbox.
--
-- Mirror conversation_reads, which grants update for exactly the same reason.
create policy "Update own conversation resolution"
  on public.conversation_resolutions for update
  to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid() and public.is_conversation_member(conversation_id)
  );

grant update on public.conversation_resolutions to authenticated;
