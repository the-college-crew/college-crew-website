# College Crew

A curated, hyperlocal marketplace connecting neighbors with verified student
providers (18+) for everyday home services. 7-week pilot, one neighborhood.

- **Spec:** `docs/SPEC.md` (authoritative) · **Wireframe:** `docs/wireframe.html`
- **Working agreements:** `CLAUDE.md`

## Stack

Next.js 16 (App Router, TypeScript) · React 19 · Tailwind CSS 4 · Supabase
(Postgres, Auth, Storage, Realtime, Edge Functions) · Stripe Connect Express
(test mode, currently stubbed) · Vercel

## Getting started

```bash
npm install
cp .env.example .env.local   # fill in real values (shared out-of-band)
npm run dev
```

Without `.env.local` the app still runs: pages render with empty data and a
banner explains what's missing. Auth, data, and chat activate once the
Supabase keys are in place.

### Database

The schema (tables, RLS, storage buckets, seed services) lives in
`supabase/migrations/`. One owner (Ari) runs schema changes:

```bash
npx supabase link --project-ref <ref>   # once
npx supabase db push                    # apply migrations
npx supabase functions deploy moderate-message
```

After pushing, regenerate types:
`npx supabase gen types typescript --linked > lib/db/types.ts`

## Commands

| Command             | What it does              |
| ------------------- | ------------------------- |
| `npm run dev`       | local dev server          |
| `npm run build`     | production build          |
| `npm run start`     | serve the build           |
| `npm run lint`      | ESLint                    |
| `npm run typecheck` | TypeScript, no emit       |

## Layout

```
app/
  (auth)/       shared: login, signup, email-confirmation callback
  (customer)/   Zach: landing, browse, profiles, booking, confirm & pay,
                dashboard, about, blog
  (provider)/   Ari: onboarding wizard, dashboard, jobs & pricing, settings
  (admin)/      Ari: provider approvals, service curation
  (shared)/     messaging thread (both roles)
  actions/      cross-group Server Actions
  api/webhooks/stripe   payment webhook (inert until Stripe exists)
components/     shared UI (+ design tokens in app/globals.css)
lib/
  supabase/     the ONLY three clients: client / server / admin (+ proxy helper)
  auth/         session + role guards
  db/           generated-style types + shared queries
  stripe/       payment seams (stubbed until the test account exists)
supabase/
  migrations/   schema + RLS + seed
  functions/    moderate-message Edge Function (chat moderation)
proxy.ts        session refresh + optimistic route protection (Next 16 middleware)
```
