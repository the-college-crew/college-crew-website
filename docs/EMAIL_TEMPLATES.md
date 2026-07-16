# College Crew Email Templates

Source-controlled templates live in this repo so local Supabase Auth and the
hosted project can stay in sync.

## Supabase Auth

Hosted Supabase projects do not read `supabase/config.toml` from this repo.
Copy the HTML from each file into Dashboard -> Authentication -> Emails ->
Templates, or update the same fields with the Supabase Management API.

| Supabase template | Subject | Source file |
| --- | --- | --- |
| Confirm signup | Confirm your email to join College Crew | `supabase/templates/confirmation.html` |
| Reset password | Reset your College Crew password | `supabase/templates/recovery.html` |
| Magic link | Your College Crew sign-in link | `supabase/templates/magic_link.html` |
| Change email address | Confirm your new email for College Crew | `supabase/templates/email_change.html` |

The templates use `{{ .SiteURL }}/college-crew-mark.png` for the logo, so the
hosted Supabase Auth Site URL must point at the deployed College Crew app.

Auth actions pass an origin-only `redirectTo`. Each template owns the complete
`/auth/callback?token_hash=...&type=...&next=...` path so a Supabase fallback
to the Site URL cannot produce an invalid `https://example.com&token_hash=...`
link. Keep that contract intact when adding another Auth email type.

## Hosted Sync

Preview the Supabase Management API payload:

```bash
npm run email:supabase-payload
```

Sync the hosted project when credentials are available:

```bash
SUPABASE_ACCESS_TOKEN=... PROJECT_REF=... npm run email:sync-supabase
```

In a linked checkout, the script reads `supabase/.temp/project-ref`
automatically. `PROJECT_REF` or `SUPABASE_PROJECT_REF` can override it.
The sync command validates the callback-link contract before writing, then
reads the hosted Auth configuration back and fails if it differs from source.

## Resend

The provider school-email verification code is sent from `lib/email/send.ts`.
It includes a branded HTML email with the same palette and logo, plus the
existing plain-text fallback. In production, set either `NEXT_PUBLIC_SITE_URL`
or Vercel's deployment URL variables so the logo URL resolves publicly.
