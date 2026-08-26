# Admissions Portal — Stress Test Report

Date: 2026-08-25
Scope: `/apply` (applicant portal) against the live Supabase project `onuqjftrljosetjkqduq`
Harness: `scripts/stress/` (live) + `src/admissions/applicationValidation.stress.test.js` (offline)

## What was run

| Layer | Method | Result |
|-------|--------|--------|
| Sign-in burst, scripted | 10 concurrent `signInWithOtp` + double-click + 9 malformed addresses, anon key only | 0/10 accepted — every call rejected `400 captcha_failed`. Server-side CAPTCHA works. |
| Sign-in burst, real browser | 11 back-to-back sign-ins on `localhost:5199/apply` (Turnstile solved) | All 11 accepted ("Check your inbox"). No email rate limit at 11/hour. Count the `+bots-stress-1..11` mails in your inbox to confirm delivery. |
| Deployed site | `https://utwat-website.vercel.app/apply` in Chrome | **Turnstile error 110200 — nobody can sign in on that hostname.** |
| Anonymous API surface | select / update / rpc / storage list / forged JWT | All blocked. RLS, RPC auth check, and JWT verification hold. |
| Offline validation matrix | 74 vitest cases through `validateApplication`, `formToApplicationPayload`, `applicationRecordToForm` | 65 pass; 9 `it.fails` cases document gaps (below). |
| Authenticated suite (races, garbage inputs, privilege escalation, storage, submit) | `scripts/stress/applicant-suite.mjs` | **Not yet run** — needs applicant sessions. See "Finishing the live run". |

## Findings

### Blockers

**B1. The deployed portal cannot sign anyone in.**
On `utwat-website.vercel.app/apply` the Turnstile widget renders "Unable to connect to website"; console shows `[Cloudflare Turnstile] Error: 110200` (hostname not in the sitekey's allowed domains). The button stays disabled, so no applicant can request a link. Localhost is allowed and works.
Fix: in the Cloudflare Turnstile widget settings add `utwat-website.vercel.app` (and the real production domain, plus `*.vercel.app` if you rely on preview URLs).

**B2. The portal is closed: the deadline is in the past.**
`portalConfig.applicationDeadlineIso = '2026-07-15T23:59:00-04:00'` and the same constant inside `submit_application()` in `202606280001_admissions_security_hardening.sql`. Today (2026-08-25) every form field is disabled and the RPC raises "The application deadline has passed." The event dates (`July 31-August 2, 2026`) are also past.
Fix: update both copies — they are two sources of truth and will drift. Better: store the deadline in a one-row `portal_settings` table the RPC reads and the client fetches.

**B3 (local only). `.env.local` breaks the local portal.**
`VITE_SUPABASE_URL = https://onuqjftrljosetjkqduq.supabase.co/rest/v1/` — supabase-js appends `auth/v1`, `storage/v1`, `functions/v1` to whatever you give it, so local sign-in hits `/rest/v1/auth/v1/otp` and gets `404 PGRST125`. The bundle deployed on Vercel has the correct bare URL, so production is unaffected. The `dist/` folder in the repo was built with the broken value.
Fix: `VITE_SUPABASE_URL=https://onuqjftrljosetjkqduq.supabase.co`.

### High

**H1. Magic link opened in a second tab → duplicate-key error on first load.**
`getOrCreateApplication()` is select-then-insert. Supabase broadcasts the new session to every open tab, so on a first sign-in two tabs race to insert; the loser gets `duplicate key value violates unique constraint "applications_one_per_user"` rendered verbatim in the red banner. Same race when someone double-clicks the link. (Predicted from code; suite section 2 confirms and counts it.)
Fix: `insert(...).select()` → on error code `23505` re-run the select; or use `upsert({ onConflict: 'user_id', ignoreDuplicates: true })` followed by a select.

**H2. The server will accept a blank application.**
`submit_application()` checks owner, status and deadline only. Anyone who calls the RPC from DevTools (or a stale tab whose form state is empty) submits an application with no name, phone, essays or agreements. Only the client validates. Suite section 6 exercises this; today it is masked by B2.
Fix: re-check `first_name`, `last_name`, `phone`, `program`, essays, `over_18`, `can_attend_in_person`, `agreements->>'agree_privacy'`, `agree_accuracy` inside the RPC and raise a readable message.

**H3. Wrong things in wrong places are answered with raw Postgres errors.**
The client has no length limits, no phone check, and no teammate-count cap; the DB has all three. A 201-character name, a 51-character phone, three long essays (`responses` > 20 000 chars serialised), or 21 teammate emails all reach the server and come back as e.g. `new row for relation "applications" violates check constraint "applications_first_name_len"` in the page banner. "Save Draft" performs no validation at all, so a scheme-less GitHub link fails with the trigger's message instead of a highlighted field. Phone `hello`, name `6475550100`, whitespace-only answers via API, and any value in the select columns (`graduation_year = "1999"`, `preferred_track = "Crypto"`) are stored as-is.
Fix: mirror the DB caps in `validateApplication` (and `maxLength` + counters on the inputs), add a digits-required phone check, cap teammates at 20, validate links on Save Draft, and add `CHECK` constraints for the option columns.

**H4. A dead or pre-consumed magic link fails silently.**
Supabase sends the applicant back to `/apply#error=access_denied&error_code=otp_expired&error_description=...`. Nothing reads the hash, so the applicant sees the sign-in panel again with no explanation. Corporate link scanners (Outlook Safe Links, some Gmail previews) consume one-time links before the human clicks, which makes this common.
Fix: parse `window.location.hash` on load and show `error_description`; offer the 6-digit code path (`{{ .Token }}` in the email template + `verifyOtp({ type: 'email', token })`) so the applicant can type it instead.

### Medium

**M1. Stale tab saves after submitting → "JSON object requested, multiple (or no) rows returned".** The RLS `USING (status = 'incomplete')` makes the update match 0 rows; `.single()` turns that into PGRST116. Refetch status on failure and say "This application was already submitted in another tab."

**M2. Last write wins; no unsaved-changes guard; no autosave.** Five tabs saving different values all succeed and the last one silently overwrites. Closing the tab after 30 minutes of typing without pressing Save Draft loses everything. Add a `beforeunload` guard while dirty and a debounced autosave, and compare `updated_at` before overwriting.

**M3. Resume checks are name-deep.** `file.type` comes from the extension, and the client hardcodes `contentType: 'application/pdf'`, so `virus.exe` renamed `resume.pdf` uploads fine (the bucket only checks the declared MIME). After submission the storage policies still allow `upsert` on the same path, so a locked application's resume can be swapped. Sniff the `%PDF-` header client-side (and ideally in an edge function), and either freeze the path or join the storage policy on application status.

**M4. Draft edits after the deadline are only blocked client-side.** Neither RLS nor the trigger checks the deadline; only `submit_application` does. Late edits stay `incomplete`, so impact is low, but an admin reading drafts sees post-deadline changes.

**M5. The progress bar starts at 27 %.** Four selects have defaults, so a blank form reports "4 of 15 required fields complete". Either exclude defaulted selects from the count or start them at a "Select…" placeholder.

**M6. Turnstile re-verification keeps the old success message.** After sending, the widget resets and spins for ~2 s while "Check your inbox for a secure sign-in link." from the previous attempt is still showing; a second click during that window does nothing and gives no feedback.

### Low

- The single-line teammate-emails input strips newlines, so a pasted list becomes `a@b.cod@e.f` and fails validation with a confusing message.
- `agree_code_of_conduct` exists in the payload but has no checkbox; `policyLinks` are empty strings.
- `maple_cup_motivation` is a dead column with its own length constraint.
- `hackathon_count`, `ml_skill_level`, `team_intent` are free text in the DB; the admin console assumes the option list.

## What held up

- Server-side CAPTCHA: every scripted `signInWithOtp` was rejected with `captcha_failed`. Bots cannot mass-create accounts.
- Email rate limit was not hit at 11 requests/hour (default built-in sender caps at ~2/hour, so custom SMTP or a raised limit appears to be configured — confirm delivery in the inbox).
- Anonymous callers: 0 rows readable, no updates, RPC refuses ("Authentication required."), resumes bucket lists nothing, forged JWT rejected (`PGRST301`).
- The hardening migration is live (RPC present, column grants in force).
- Client validation on the Submit path correctly handles `javascript:`, `data:`, scheme-less and whitespace URLs, comma lists, whitespace-only required answers, and string/number "truthy" agreements.

## Finishing the live run

Sections 2–6 of `scripts/stress/applicant-suite.mjs` (two-tab race, 10 concurrent loads and saves, 32 garbage inputs, 17 privilege-escalation attempts, 9 storage abuses, blank/double submit) need applicant sessions. Either:

1. **Service role (recommended, no email):**
   ```bash
   export SUPABASE_SERVICE_ROLE_KEY=...          # dashboard → Project Settings → API; never commit it
   STRESS_EMAIL_BASE=you@gmail.com node scripts/stress/sessions.mjs
   node scripts/stress/applicant-suite.mjs
   STRESS_EMAIL_BASE=you@gmail.com node scripts/stress/cleanup.mjs   # deletes the +bots-stress-* users
   ```
2. **From the inbox:** paste the unclicked "Your Magic Link" URLs for `+bots-stress-1..11` into `links.txt`, then `STRESS_MAGIC_LINKS=links.txt node scripts/stress/sessions.mjs`. Clicked links are consumed and will not work.

Then move the deadline (B2) and re-run section 6 to see H2 without the deadline masking it.

The eleven `pranav2008sharma+bots-stress-N@gmail.com` auth users created by the sign-in burst still exist in the project; `cleanup.mjs` removes them.
