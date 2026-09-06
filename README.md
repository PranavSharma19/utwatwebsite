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

> **Restart the dev server after editing `tailwind.config.js`.** Vite hot-reloads
> component and CSS edits, but not the Tailwind config — the running process keeps
> serving the stylesheet it compiled at startup. A new colour token will read as
> `rgba(0, 0, 0, 0)` in the browser while `npm run build` and the test suite both
> pass, because those compile fresh. This has caused two separate rounds of
> "the site is transparent" debugging.

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

## Post-admission: RSVP, waiver, door check-in

Design: `docs/superpowers/specs/2026-09-05-post-admission-rsvp-checkin-design.md`.

An admitted applicant RSVPs from their status link (`/apply/status/<token>`).
The form only renders while `participantWaiver.placeholder` in
`src/legal/legalContent.js` is `false` — the "waiver is live" switch, now
flipped, with the final wording in the same file. Setting it back to `true`
closes RSVPs site-wide without a deploy of anything else, which is the lever
to pull if the wording has to be pulled back. Whenever the wording changes
after anyone has accepted it, bump the version in all three places
(`participantWaiver.version`, `portalConfig.waiverVersion`, and
`WAIVER_VERSION` in `supabase/functions/submit-application/rsvp.ts`) so each
stored acceptance still names the text that was accepted. RSVPs close at
`portalConfig.rsvpDeadlineIso`; anyone admitted after that gets 24 hours.

Deploy:

```bash
npx supabase@latest db push                                # 202609060001_rsvp_checkin.sql
npx supabase@latest functions deploy submit-application    # status + rsvp
npx supabase@latest functions deploy admin-applications    # checkin, reset
```

Console additions (same admin path): RSVP column and filter, headcount strip,
**Export Admitted** (mail-merge CSV with `status_url`), **Export All + Links**
(the same, for every decision including waitlisted and rejected, with a
`status` column to split the sheet by), **Export Attending** (door clipboard,
sorted by last name), and **Door Scan** at `<adminPath>/checkin`.

### Telling applicants their link exists

The status link is the only way into the status page, and the applicant's own
copy of it lives in one browser's localStorage (`draftStorage.js`). Clearing
site data, a second device, or a private window loses it, and there is no
self-serve recovery. The decision email is therefore not a courtesy -- it is
the durable copy.

Send it as a **mail merge**, one message per applicant, never a CC or BCC. A
broadcast cannot carry a per-person link, so it degrades to "check the site",
which is not an instruction anyone can follow without their token. A CC also
discloses every applicant's address to every other applicant.

Both link exports build from every loaded application, not from the current
filter, so a filter left set in the console cannot silently drop people from
the merge. Send yourself a test row first and click the merged link: a merge
that mangles the URL fails silently and completely.

Anyone who turns up with no link is found by email at the door
(`checkin_by_email`) or by name in the console.

### Door runbook (Sept 12)

1. Every organizer on the door is in `ADMIN_EMAIL_ALLOWLIST` and has signed
   in on their phone at `<adminPath>/checkin` the day before.
2. Print **Export Attending** the morning of.
3. Scan the attendee's ticket. Green: in. Yellow: already in. Red: send to
   the desk. No code: type their email on the same page, or tick the paper
   list and enter it later from the console (row → Check in manually).
4. After the rush, reconcile paper ticks from the console.

**Reset RSVP after the deadline has passed is a one-way door by itself.**
The button's "they will need to RSVP again" is only true before
`portalConfig.rsvpDeadlineIso` (or the applicant's 24-hour late-admit grace).
Reset it after that and `rsvpGate` returns "rsvp closed" forever — no ticket,
no waiver, and the check-in CHECK constraint won't even allow a manual
check-in. **Recovery:** change the row's Decision Status to **Waitlisted**,
save, then change it back to **Admitted** and save again. That re-stamps
`decided_at`, which grants a fresh 24-hour RSVP window via
`effectiveRsvpDeadline` (`rsvp.ts`) — the same mechanism a late admit gets.
The trigger also clears any stale RSVP fields on the way through Waitlisted,
so this works whether or not you've already pressed Reset RSVP.

**Supabase Auth redirect-URL allowlist.** `AuthPanel.jsx` sends
`emailRedirectTo` for the door page as `<origin>/ops/bots-triage-7f3a/checkin`
— a path that did not exist before this branch. If the Supabase project's
Auth → URL Configuration → Redirect URLs list is exact-match rather than
wildcarded, add this path (and the production origin) before Sept 12, or
every door organizer's magic link lands on the site root instead of the
scan page.

### Pre-launch checklist and open work

Nothing below has been done yet in this environment. It is the exact set of
steps standing between the code on this branch and a working RSVP flow at
BOTS 2026. Run it in order; do not skip ahead to a later step before an
earlier one is confirmed.

1. **Type-check both edge functions under Deno.** Deno is not installed on
   the machine this plan was built on (`which deno` found nothing), so
   neither function has ever been type-checked, only unit-tested (their
   Deno-free pure modules — `rsvp.ts`/`application.ts` and `checkin.ts` — are
   covered by Vitest; the `Deno.serve` handlers in `index.ts` are not). Run,
   once Deno is available:

   ```bash
   deno check supabase/functions/submit-application/index.ts
   deno check supabase/functions/admin-applications/index.ts
   ```

   Expect no type errors. If either fails, stop and fix before deploying —
   do not deploy an unchecked handler.

2. **Apply the migration, then run the manual SQL rule test.** The migration
   `supabase/migrations/202609060001_rsvp_checkin.sql` has not been applied
   to any database. Apply it first — the functions below depend on the
   columns and trigger rules it adds, so it must land *before* either
   function is deployed, never after:

   ```bash
   npx supabase@latest db push
   ```

   Then, on a local stack only (it runs inside a transaction and rolls
   back, so it is safe to run repeatedly and leaves no rows behind):

   ```bash
   npx supabase@latest start                 # if the local stack isn't already running
   npx supabase@latest db reset              # applies every migration fresh, local only
   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
     -f supabase/tests/rsvp_rules.sql
   ```

   Confirm it prints no `FAIL rule …` lines. It exercises rules 1–5 from the
   design spec (no RSVP while merely submitted, RSVP frozen once given
   except for an admin reset, an attending RSVP requires waiver + emergency
   contact, no check-in while pending, etc.) against a real Postgres, which
   the Vitest suite cannot do.

   Then, against the target project, confirm the migration actually landed
   there too:

   ```sql
   select count(*) filter (where rsvp_status is not null), count(*) from applications;
   ```

   Expect the two numbers to be equal — every row gets a default
   `rsvp_status` from the migration, so any gap between them (or an error
   saying the column doesn't exist) means the migration did not actually
   apply to that table.

3. **Deploy both edge functions.** Neither has ever been deployed — no
   `supabase functions deploy` has been run at any point in this plan, by
   deliberate ruling: deploys touch the live project and are the
   organizers' to run, not something to do from an agent session. Both have
   changes sitting undeployed:
   - `submit-application` — the widened `status` action and the new `rsvp`
     action (Task 3).
   - `admin-applications` — the new `checkin` / `checkin_by_email` actions
     and the PATCH `rsvp_reset` / `checked_in` handling, plus the
     `decided_at` fix so a same-status PATCH no longer re-stamps it and
     silently extends the 24-hour grace window (Task 8).

   Deploy only after Step 2's migration is live:

   ```bash
   npx supabase@latest functions deploy submit-application
   npx supabase@latest functions deploy admin-applications
   ```

4. **Deploy the frontend.** Nothing above ships the SPA itself, and it is
   what carries the RSVP form, the ticket, the scan page, and the routes
   this plan added — none of that reaches BOTS 2026 on its own. This repo is
   a Vercel project already linked via `.vercel/project.json` (`vercel.json`
   only adds the SPA rewrite; there is no separate build config or CI
   workflow), so it deploys one of two ways:
   - **Git push** to the branch the Vercel project's Git settings watch
     (check the project's Settings → Git in the Vercel dashboard; it is
     typically `main`). Pushing there triggers an automatic production
     build and deploy — this is almost certainly how the live site
     actually updates today, and it is why this step is easy to miss: it
     looks like it "just happens."
   - **`npx vercel deploy --prod`** from the repo root, if you need a
     production deploy without merging (for example, to get Step 8's
     phone walkthrough a real HTTPS URL ahead of a merge). Requires
     `vercel login` once.

   Either way, afterward confirm in the deployed build (not `npm run dev`)
   that `/apply/status/<token>`, `<adminPath>`, and `<adminPath>/checkin`
   all load — Step 5 below assumes "whatever build is live" already
   reflects this branch, and that assumption is only true once this step
   has actually run.

5. **Run the Task 3 manual end-to-end check.** This needs a deployed
   `submit-application` (Step 3) and one test application admitted through
   the console. With `$SUPABASE_URL` and `$SUPABASE_ANON_KEY` set and
   `<token>` the admitted row's status token:

   ```bash
   curl -s -X POST "$SUPABASE_URL/functions/v1/submit-application" \
     -H "apikey: $SUPABASE_ANON_KEY" -H "Content-Type: application/json" \
     -d '{"action":"status","statusToken":"<token>"}'
   # expect rsvp_status "pending" and rsvp_deadline "2026-09-11T03:59:00.000Z"

   curl -s -X POST "$SUPABASE_URL/functions/v1/submit-application" \
     -H "apikey: $SUPABASE_ANON_KEY" -H "Content-Type: application/json" \
     -d '{"action":"rsvp","statusToken":"<token>","attending":true,"emergencyContactName":"Test","emergencyContactPhone":"6475550100","waiverAccepted":true,"rosterOptIn":false}'
   # expect rsvp_status "attending"

   curl -s -X POST "$SUPABASE_URL/functions/v1/submit-application" \
     -H "apikey: $SUPABASE_ANON_KEY" -H "Content-Type: application/json" \
     -d '{"action":"rsvp","statusToken":"<token>","attending":true,"emergencyContactName":"Test","emergencyContactPhone":"6475550100","waiverAccepted":true,"rosterOptIn":false}'
   # repeat -> 409 { "error": "already responded" }
   ```

6. **Read `/waiver` on the deployed site.** It must show the real wording,
   not a draft, and its "Last updated" must match `portalConfig.waiverVersion`.
   This is the text applicants are legally accepting, and Step 7 is the first
   moment anyone can be bound by it — so read it on the live build, in a
   logged-out browser, before you send a single decision email.

7. **Walk the RSVP → ticket → check-in loop against the deployed site.**
   Admit a test application in the console and open its status page:
   - The RSVP form renders (not "RSVP opens shortly"). If it says the latter,
     the build that is live still has `participantWaiver.placeholder` as
     `true` — redeploy the frontend (Step 4).
   - RSVP yes → get a ticket with a QR code.
   - Scan the ticket at `<adminPath>/checkin` → reads green ("Checked in").
   - Scan it again → reads yellow ("Already checked in").
   - In the console, the row shows Checked In; **Reset RSVP** (the two-step
     button) returns it to pending.
   - Delete the test application before decisions go out.

8. **Two browser walkthroughs, never performed in this environment** for
   want of an admin Supabase session:
   - **Admin console**: RSVP column and filter, headcount strip, manual
     check-in (row → Check in manually), undo check-in, and the two-step
     RSVP reset button. Also click the **Door Scan** link from the admin
     console and confirm it lands on `<adminPath>/checkin` — the link
     (`AdmissionsAdminPage.jsx`) and the route (`App.jsx`) were written by
     different tasks and were only checked against each other by an exact
     string match, never by a click-through; a mismatch there fails
     silently, since React Router's catch-all just bounces the operator to
     the landing page with no error.
   - **Door scan page, on a real phone with a real camera** — do this dry
     run by **Sept 11**, the day before doors open, so there is a day left
     to fix whatever it finds. Over HTTPS (Step 4's deploy, or
     `npm run dev -- --host` plus a Vercel preview URL): camera permission
     and rear-camera selection, a real QR scan of a Task 6 ticket decoding
     through to a check-in, the green/yellow/red result overlay timing, the
     5-second re-scan debounce, the email fallback form, and sign-in gating
     via `AuthPanel` with the `<adminPath>/checkin` redirect. The scan
     page's camera path has zero automated coverage — jsdom has no camera
     APIs — so it is entirely unverified until someone points a phone at a
     ticket, and it is the single surface here with the most day-of
     exposure.

9. **Both link exports open in Sheets with a working `status_url` column.**
   From the console, run **Export Admitted** and **Export All + Links** and
   open each CSV in Google Sheets (or Excel); confirm the `status_url` column
   contains a working link to each applicant's `/apply/status/<token>` page,
   and that **Export All + Links** carries waitlisted and rejected rows that
   **Export Admitted** does not.

10. **Read `/code-of-conduct` on the deployed site.** The waiver binds
    acceptors to it by name, so it has to be readable before anyone accepts
    the waiver. Confirm the Code of Conduct link in the footer resolves.

Record the result of each step in the commit body when this checklist is
run for real.
