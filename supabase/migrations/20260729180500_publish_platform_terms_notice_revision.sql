begin;

set local lock_timeout = '10s';
set local statement_timeout = '2min';

-- Replace the stale legal-notice mailbox with College Crew's public support
-- process. The version and exact content hash change together so existing
-- immutable acceptance evidence remains preserved but cannot satisfy the
-- current-version gate.
do $$
begin
  update private.current_legal_document_contract
  set version = '2026-07-29.1',
      content_hash = '28eaacafe053ee7d5bde0001210d65a960c417be15cef5b157c19e5425f9a99c'
  where kind = 'platform_terms'
    and version = '2026-07-29'
    and content_hash =
      'c8d21c1f8d64f46884ba65bce4ecc7808f3c45c4a20d39f06b368d19225f757b';

  if not found then
    raise exception 'PLATFORM_TERMS_CONTRACT_BASELINE_CHANGED';
  end if;
end;
$$;

commit;
