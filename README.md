# Battle of the Schools Website

Single-page event website plus a Supabase-backed admissions portal for BOTS 2026.

## Routes

- `/` - current public landing page.
- `/apply` - applicant admissions portal.
- `/apply/admin` - organizer admissions console.

## Local Setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in `.env.local` before using the portal.

`VITE_TURNSTILE_SITE_KEY` (the public Cloudflare Turnstile sitekey that pairs
with `TURNSTILE_SECRET_KEY` below) is also a client variable. It is optional
in the sense that the site works without it — but note what "works" means:
with it unset the widget never mounts, so no cheer is ever submitted and the
tug-of-war bar stays at an even split forever, looking entirely healthy. Set
it in any environment where the cheer tracker is meant to actually count.

## Supabase Setup

Apply the migration in `supabase/migrations/202606200001_admissions_portal.sql`, then deploy the `admin-applications` Edge Function.

The function needs these secrets:

```bash
SUPABASE_SERVICE_ROLE_KEY=...
ADMIN_EMAIL_ALLOWLIST=organizer1@example.com,organizer2@example.com
```

Applicants authenticate with passwordless email OTP. Admin access is granted only to authenticated users whose email is in `ADMIN_EMAIL_ALLOWLIST`.

### Faction cheer tracker

Apply `supabase/migrations/202608250001_faction_cheers.sql`, then deploy the
`faction-cheer` Edge Function. It needs:

```bash
SUPABASE_SERVICE_ROLE_KEY=...
TURNSTILE_SECRET_KEY=...
TURNSTILE_EXPECTED_HOSTNAME=<the production hostname the Turnstile widget runs on>
CHEER_HASH_SALT=<any long random string>
ALLOWED_ORIGIN=https://<production-domain>
```

`ALLOWED_ORIGIN`, `TURNSTILE_EXPECTED_HOSTNAME` and `CHEER_HASH_SALT` are not
optional: the function fails closed and refuses writes (`GET` still works) if
any of them is unset, rather than defaulting open. `CHEER_HASH_SALT` is the
one whose absence would otherwise be invisible — without it `visitor_hash`
degrades to `SHA-256("<ip>|YYYY-MM-DD|")`, which is a 2^32 keyspace against a
known date, i.e. the table would hold effectively reversible IP addresses
while the deploy looked perfectly healthy.

`supabase/config.toml` pins `verify_jwt = false` for `faction-cheer`, because
cheering is anonymous and there is no session to verify; with the platform
default left on, every cheer is rejected at the gateway with a 401 before the
function runs. The project anon key is still required and is sent by
`src/cheer/cheerClient.js`.

The `faction_cheers` table has RLS enabled with no policies — it is
unreachable with the anon key by design. All access goes through the
function under the service role, which also rate-limits and Turnstile-checks
every write. The uniqueness guarantee is one cheer per IP address per UTC
day, accumulating into an all-time tally — not one cheer per visitor forever;
see the comment on `faction_cheers_visitor_uniq` in the migration for why.
