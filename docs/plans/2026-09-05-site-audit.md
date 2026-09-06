# Site audit — 2026-09-05

**Status:** in progress. This file is a stub so the branch has a Vercel Preview
deployment for the usability walkthrough. The full report replaces it when the
swarm finishes.

**Scope:** read-only audit of the whole site — security (RLS, admin client
boundary, webhooks, API routes), data and payment flows, code quality against
Next 16 / React 19 conventions, test and build health, customer usability,
provider and admin usability, SEO / performance / content.

**Method:** ruflo hierarchical swarm, 7 workers, lead is sole writer. Code
findings cite `file:line`. Usability findings come from a live walkthrough of
this branch's Preview deployment using the three durable synthetic personas.
Nothing writes to production; the Supabase MCP used is read-only.
