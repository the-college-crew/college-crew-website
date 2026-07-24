# CollegeCrew — DNS & email deliverability

Reference for `thecollegecrew.com`. DNS lives at GoDaddy, outside this repo and
outside version control, so this file is the only record of *why* the zone looks
the way it does. Update it whenever the zone changes.

**Registrar / DNS host:** GoDaddy (`ns09.domaincontrol.com`, `ns10.domaincontrol.com`)
**Registration renews:** 2027-06-30 (auto-renew on; verified renewed 2026-06-30)
**Last audited:** 2026-07-24

> Verify against the authoritative nameserver, not the GoDaddy panel or a
> provider dashboard. Both cache and both have shown stale "verified" states.
> ```sh
> dig +short CAA thecollegecrew.com @ns09.domaincontrol.com
> ```

---

## 1. What serves what

| Host | Points to | Purpose |
| --- | --- | --- |
| `@` | A `216.198.79.1` | Vercel apex (current Vercel IP; `76.76.21.21` is deprecated) |
| `www` | CNAME `cb9401ea8f3c2673.vercel-dns-017.com` | Vercel, project-specific |
| `@` | MX `smtp.google.com` (pri 1) | Google Workspace — receiving |
| `send.send` | MX `feedback-smtp.us-east-1.amazonses.com` (pri 10) | Resend/SES bounce handling — see §2 |
| `links.send` | CNAME `links1.resend-dns.com` | Resend click/open tracking (CloudFront) |
| `_domainconnect` | CNAME `_domainconnect.gd.domaincontrol.com` | GoDaddy Domain Connect helper; harmless |

Sending domain in Resend is **`send.thecollegecrew.com`**, not the apex.

---

## 2. The `send.send` records are correct — do not "fix" them

The zone contains records named `send.send` (an MX and an SPF TXT). This looks
like a duplicated-label typo. **It is not.** Do not collapse them to `send`.

Our Resend domain is `send.thecollegecrew.com`. Amazon SES places its MAIL FROM
subdomain one level *beneath* the sending domain, which resolves to
`send.send.thecollegecrew.com`. Resend's API reports all four records verified.

Collapsing these to `send` silently breaks bounce handling and SPF for every
transactional email the app sends.

---

## 3. Email authentication

| Record | Value | Notes |
| --- | --- | --- |
| SPF (apex) | `v=spf1 include:_spf.google.com ~all` | Google Workspace only. 1 DNS lookup, well under the limit of 10. Resend sends from the subdomain, so it needs no include here. |
| SPF (`send.send`) | `v=spf1 include:amazonses.com ~all` | Resend/SES envelope domain |
| DKIM (`google._domainkey`) | 2048-bit key | Full length — GoDaddy has historically truncated long TXT values, so check this if Google mail starts failing DKIM |
| DKIM (`resend._domainkey.send`) | 1024-bit key | SES default; not configurable |
| DMARC (`_dmarc`) | `v=DMARC1; p=quarantine; adkim=r; aspf=r; rua=mailto:zach@…,mailto:ari@…` | |

**`adkim=r; aspf=r` (relaxed alignment) is deliberate.** Resend signs as
`send.thecollegecrew.com` while the From header is `@thecollegecrew.com`.
Relaxed alignment treats these as the same organizational domain and passes.
Switching either to strict (`s`) breaks DMARC for all Resend mail.

Moving to `p=reject` was considered and deferred — revisit after reviewing a few
weeks of `rua` aggregate reports.

---

## 4. CAA — which CAs may issue certificates for us

Added 2026-07-24. Before this the zone had no CAA record, meaning any CA in the
world could be persuaded to issue a certificate for the domain.

All eight are at `@`, flags `0`:

| Tag | Value | Why |
| --- | --- | --- |
| `issue` | `letsencrypt.org` | Vercel's primary CA |
| `issue` | `pki.goog` | Vercel's fallback CA — see below |
| `issue` | `amazon.com` | Resend tracking host (`links.send`) |
| `issue` | `amazontrust.com` | " |
| `issue` | `awstrust.com` | " |
| `issue` | `amazonaws.com` | " |
| `issuewild` | `;` | Forbids **all** wildcard certificates |
| `iodef` | `mailto:zach@thecollegecrew.com` | Blocked-issuance reports |

**Why `pki.goog` is in the list.** Vercel's public docs name only Let's Encrypt,
but their own CNAME target zone (`vercel-dns-017.com`) publishes CAA permitting
`letsencrypt.org`, `pki.goog`, `globalsign.com`, and `sectigo.com`. Certificate
Transparency shows a Google Trust Services (`pki.goog`) certificate issued for
our apex on 2026-05-26 — i.e. Vercel does fall back. The apex is an A record,
not a CNAME, so *our* CAA governs it directly; a Let's-Encrypt-only list would
have removed Vercel's fallback and risked the apex certificate lapsing during a
Let's Encrypt outage or rate limit.

`globalsign.com` and `sectigo.com` were deliberately **left out** — no evidence
of recent use, and `iodef` will report a blocked attempt well before expiry.

**Why the four Amazon values.** ACM validates against any of them and does not
document which it presents; listing all four avoids a renewal failure if AWS
shifts. `links.send` is a CNAME, so a CA may consult the alias target's CAA
instead of ours — these entries make it work either way.

**`issuewild ";"` is the record most likely to need changing.** If we ever add a
wildcard domain in Vercel, this must be relaxed first or issuance will fail.

---

## 5. Change log

### 2026-07-24 — full zone audit

- **Removed** `CNAME pay → paylinks.commerce.godaddy.com`. Left over from
  GoDaddy Payments; resolved but returned 404. Dead record, no longer used.
- **Added** the eight CAA records in §4.
- Everything else audited and left unchanged.

Verified after the change: all records match at both `ns09.domaincontrol.com`
and `8.8.8.8`; apex and `www` serving Let's Encrypt, `links.send` serving
Amazon; no regression in A / MX / SPF / DKIM / DMARC.

**Loose ends being watched:**

- **~2026-08-31** — first Vercel apex certificate renewal under CAA. Expected to
  be uneventful. A failure would surface as an `iodef` email before expiry.
- **2026-08-24 / 2026-09-28** — orphaned Google Trust Services and GoDaddy
  certificates from the pre-Vercel/GoDaddy-Payments era expire. Expected to
  simply lapse. If something breaks, it means a forgotten service was using them.

---

## 6. Re-audit commands

```sh
NS=ns09.domaincontrol.com

# Core records
dig +short A     thecollegecrew.com            @$NS
dig +short MX    thecollegecrew.com            @$NS
dig +short TXT   thecollegecrew.com            @$NS
dig +short TXT   _dmarc.thecollegecrew.com     @$NS
dig +short CAA   thecollegecrew.com            @$NS

# Resend (note the doubled label — see §2)
dig +short MX    send.send.thecollegecrew.com  @$NS
dig +short TXT   send.send.thecollegecrew.com  @$NS
dig +short TXT   resend._domainkey.send.thecollegecrew.com @$NS

# Which CA is actually serving each host
for h in thecollegecrew.com www.thecollegecrew.com links.send.thecollegecrew.com; do
  printf '%-34s' "$h"
  curl -sv --max-time 12 "https://$h" -o /dev/null 2>&1 | grep -i 'issuer:'
done

# Every certificate ever issued for the domain (catches unknown issuers)
curl -s -H 'User-Agent: Mozilla/5.0' \
  'https://crt.sh/?q=thecollegecrew.com&output=json' | jq -r '.[].issuer_name' | sort -u
```

DNSSEC is currently **unsigned**. Registrar locks (`clientDelete/Renew/Transfer/
UpdateProhibited`) are all active.
