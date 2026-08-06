# Expandable Help widget and AI support agent

**Status:** in progress
**Owner:** Zach
**Branch:** feature/ai-support-widget
**Updated:** 2026-08-06

## Goal

Replace the floating Feedback link with an accessible Help menu that keeps the
public ticket and email paths available and adds a signed-in, read-only College
Crew AI assistant. The assistant streams answers from reviewed, git-backed
product guidance and a minimal server-verified account/page summary without
persisting chat content.

## Approach

- Convert `FeedbackLauncher` into desktop popover/mobile sheet states for the
  Help menu, sign-in gate, and session-only chat. Keep route exclusions and the
  existing `/support` ticket workflow.
- Add shared validation and stream contracts, a reviewed support manual,
  server-side route classification/context building, safe navigation mapping,
  prompt construction, and hashed user safety identifiers.
- Add a Node Route Handler backed by the OpenAI Responses API using
  `gpt-5.6-luna`, `store: false`, bounded stateless transcript replay, and SSE.
- Add service-role-only request metadata, atomic per-user quotas, status
  updates, and 30-day cleanup in a Supabase migration with database tests.
- Update environment documentation, privacy policy, product spec, wireframe,
  Preview runbook, and payment FAQ copy. Add focused unit, route, and browser
  coverage, then run the repository verification suite.

## Open questions

None. The implementation plan was approved before this branch was created.

## Notes

- RuFlo Brain remains disabled for the active trial and is not used.
- The project uses imperative Supabase migrations (`schema_paths = []`).
- Production rollout and secret provisioning remain operational steps after
  the code PR; no secrets are written to this public repository.
