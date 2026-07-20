-- The 2026-07-20 platform terms update (Section 8 arbitration clause) bumped
-- PLATFORM_TERMS_VERSION and its content hash in apps/web/lib/legal/waivers.ts,
-- but the RLS "current document" registry was never updated to match, so every
-- legal_acceptances insert for platform_terms was rejected by RLS.
update private.current_legal_document_contract
set version = '2026-07-20',
    content_hash = '603a6f06820600bed07b092e4281c1d94e8f8b5d56b7dc9fe1c6e307d2047dd8'
where kind = 'platform_terms';
