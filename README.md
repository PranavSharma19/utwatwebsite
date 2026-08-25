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

`ALLOWED_ORIGIN` and `TURNSTILE_EXPECTED_HOSTNAME` are not optional: the
function fails closed and refuses writes (`GET` still works) if either is
unset, rather than defaulting open.

The `faction_cheers` table has RLS enabled with no policies — it is
unreachable with the anon key by design. All access goes through the
function under the service role, which also rate-limits and Turnstile-checks
every write. The uniqueness guarantee is one cheer per IP address per UTC
day, accumulating into an all-time tally — not one cheer per visitor forever;
see the comment on `faction_cheers_visitor_uniq` in the migration for why.
