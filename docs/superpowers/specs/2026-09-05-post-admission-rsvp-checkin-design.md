# Post-admission flow: RSVP, waiver, and door check-in

**Date:** 2026-09-05
**Status:** Approved design, awaiting implementation plan
**Event:** Battle of the Schools, September 12–13, 2026

## 1. Problem

Applications are landing in Supabase and admins can admit, waitlist, or
reject from the console. Nothing exists after that decision. There is no
way for an admitted applicant to confirm they are coming, no record of a
waiver, no headcount, and no way to check people in at the door.

The event is in seven days. Applications close September 8. Roughly 200
people will be admitted. Decisions go out by mail merge from a CSV.

## 2. Constraints that shape the design

- **Applicants have no accounts.** Since the anonymous-applications change,
  an applicant is identified only by the unguessable `status_token` in
  their bookmark link (`/apply/status/<token>`). That token is the identity
  for everything below. No new token, no login.
- **No email sending exists in the codebase.** Decision emails are sent by
  the organizers via mail merge. The site's job is to produce the CSV.
- **Timeline.** RSVP must exist before the first decision email on
  September 8. The door scan is needed on September 12. Everything ships
  in the same week, so scope is minimal and additive.
- **18+ only.** The application already records `over_18`. Applicants
  marked under 18 cannot RSVP and are told to email the organizers.
- **RSVP hard-closes September 10, end of day (America/Toronto).** No late
  RSVPs. No-shows are not handled. Catering is already finalized.

## 3. Decisions made during design

| Question | Decision |
|---|---|
| Native form vs Google Form | Native, on the existing status page |
| RSVP fields | Attending yes/no, dietary restrictions, emergency contact name and phone, waiver acceptance, roster opt-in |
| T-shirt size | Not collected |
| Who scans at the door | Organizer scans the attendee's personal QR |
| Waiver | Required. 18+ only. Text still to be written. |
| RSVP deadline | Sept 10 23:59 ET, enforced server-side, hard close |
| Roster page | Phase two. Opt-in checkbox is collected now. |

## 4. Data model

All state lives on the existing `public.applications` row. No new tables.

### 4.1 New enum

```sql
create type public.rsvp_status as enum ('pending', 'attending', 'declined');
```

### 4.2 New columns

| Column | Type | Written by | Notes |
|---|---|---|---|
| `rsvp_status` | `rsvp_status not null default 'pending'` | RSVP action, admin reset | |
| `rsvp_at` | `timestamptz` | RSVP action | Set on attending and declined |
| `dietary_restrictions` | `text` | RSVP action | Optional, max 500 chars |
| `emergency_contact_name` | `text` | RSVP action | Required when attending |
| `emergency_contact_phone` | `text` | RSVP action | Required when attending |
| `waiver_accepted_at` | `timestamptz` | RSVP action | Only when the box was ticked |
| `waiver_version` | `text` | RSVP action | Copied from `portalConfig.waiverVersion` |
| `roster_opt_in` | `boolean not null default false` | RSVP action | Consent for the phase-two roster |
| `checked_in_at` | `timestamptz` | Admin check-in | |
| `checked_in_by` | `text` | Admin check-in | Organizer's email, same pattern as `decided_by` |

The migration is additive with defaults on every column, so it applies to
the live database without touching existing rows.

### 4.3 Invariants, enforced in `enforce_application_rules()`

The existing `applications_enforce_rules` trigger runs on every insert and
update, including service-role writes, so these rules hold regardless of
which function performs the write.

1. RSVP fields (`rsvp_status`, `rsvp_at`, `dietary_restrictions`,
   `emergency_contact_*`, `waiver_*`, `roster_opt_in`) may only change
   when `status = 'admitted'`.
2. Once `rsvp_status` is not `pending`, the RSVP fields are frozen. The
   only permitted transition out is back to `pending` with every RSVP
   field cleared (the admin reset).
3. `rsvp_status = 'attending'` requires `waiver_accepted_at`,
   `waiver_version`, `emergency_contact_name`, and
   `emergency_contact_phone` to be non-null.
4. `checked_in_at` may only be set when `rsvp_status = 'attending'`.
   Clearing it is allowed (admin undo).
5. If `status` moves away from `admitted` (for example an admin reverts a
   decision), the trigger resets every RSVP and check-in field to its
   default. A person who is no longer admitted has no RSVP.

Rules 1–4 protect against bugs in the edge functions. Rule 5 keeps the
console's counts honest.

### 4.4 Config

Added to `portalConfig`:

```js
rsvpDeadlineIso: '2026-09-10T23:59:00-04:00',
waiverVersion: '2026-09-08',   // bump when the text changes
minimumAge: 18,
```

`portalConfig.test.js` gains a check that the RSVP deadline falls after the
application deadline and before `eventStartIso`, matching the existing
deadline test.

## 5. Applicant flow

Everything happens on the existing status page. The decision email links
to the same URL the applicant already has.

### 5.1 `status` action returns more fields

The `submit-application` function's `status` action currently selects
`status, submitted_at, first_name, school, preferred_track`. It adds
`over_18, rsvp_status, rsvp_at, dietary_restrictions,
emergency_contact_name, emergency_contact_phone, roster_opt_in,
checked_in_at`. The token remains the only thing the endpoint accepts.

### 5.2 New `rsvp` action

Request:

```json
{
  "action": "rsvp",
  "statusToken": "<uuid>",
  "attending": true,
  "dietaryRestrictions": "vegetarian",
  "emergencyContactName": "…",
  "emergencyContactPhone": "…",
  "waiverAccepted": true,
  "rosterOptIn": true
}
```

Server-side checks, in order, each returning a distinct error string the
page can render:

| Check | Error |
|---|---|
| Token matches a row | `not found` (404) |
| `status = 'admitted'` | `not admitted` (403) |
| `over_18 = true` | `underage` (403) |
| `now() <= effective deadline` (see below) | `rsvp closed` (403) |
| `rsvp_status = 'pending'` | `already responded` (409) |
| If attending: name and phone present, `waiverAccepted === true` | `invalid` (400) with field list |

**Effective deadline.** The deadline for a row is the later of
`rsvpDeadlineIso` and `decided_at + 24 hours`. Anyone admitted before
Sept 10 has until Sept 10 23:59 ET. Anyone admitted from the waitlist
after that has 24 hours from the moment the admin pressed Admit. The
`status` action returns the computed `rsvp_deadline` so the page shows the
right date without duplicating the rule client-side.

On `attending: false` the function writes only `rsvp_status = 'declined'`
and `rsvp_at`. Other fields stay null.

On success it writes all fields, sets `waiver_accepted_at = now()` and
`waiver_version = portalConfig.waiverVersion`, and returns the same shape
as `status` so the page can re-render without a second call.

Turnstile is not required for this action. The token is already an
unguessable capability and the write is bounded to one row that the
caller already controls. Rate limiting is left to Supabase's defaults.

### 5.3 What the status page renders

| State | Page shows |
|---|---|
| `submitted`, `waitlisted`, `rejected` | Unchanged from today |
| `admitted`, `over_18 = false` | Admitted badge, message: the event is 18+, email `contactEmail` |
| `admitted`, pending, before their deadline | Admitted badge, RSVP form (5.4), the deadline date shown above it |
| `admitted`, pending, after their deadline | Admitted badge, message: RSVPs closed on that date and the spot was released |
| `declined` | Short thanks. No undo on the page. |
| `attending`, not checked in | Ticket card (5.5) plus read-only summary of what they submitted |
| `attending`, checked in | Ticket card with a "Checked in" mark and time |

The page renders from the `rsvp_deadline` the server returns; the server
enforces the same value. The client never computes the deadline itself.

### 5.4 RSVP form

Fields, top to bottom:

1. **Are you attending?** Two large buttons, Yes / No. Selecting No hides
   everything below except the submit button.
2. **Dietary restrictions** (optional text).
3. **Emergency contact name** (required).
4. **Emergency contact phone** (required, loose validation: 7+ digits).
5. **Waiver** checkbox, required: "I have read and agree to the
   [Participant Waiver](/waiver)."
6. **Roster** checkbox, optional, default unchecked: "Show my first name,
   last initial, and school on the public participants list."
7. Submit. One shot, matching the application form. Copy under the button
   says so.

Validation reuses the style of `applicationValidation.js`, in a new
`rsvpValidation.js` with its own tests.

### 5.5 Ticket card and QR code

Shown when `rsvp_status = 'attending'`. Contains first name, school, track,
and a QR code that encodes the full status URL
(`${origin}/apply/status/<token>`). Encoding the URL rather than the bare
token means a phone camera outside the scan page still lands somewhere
sensible, and the scan page extracts the token from either form.

QR generation is client-side with a small dependency (`qrcode`, rendered
to a canvas). Nothing is stored. The QR discloses nothing the bookmark
does not already disclose.

Copy on the card: "Show this at the door. Screenshot it now in case you
lose the link."

### 5.6 Waiver page

New route `/waiver`, rendered by the existing `LegalPage` component with a
new document in `src/legal/legalContent.js`. The document carries the
version string that `portalConfig.waiverVersion` must match; a test
asserts they agree.

**The waiver text does not exist yet.** The page ships with a clearly
marked placeholder body. Publishing real text is a hard prerequisite for
sending decision emails (see section 7). If the text changes after anyone
has accepted it, bump `waiverVersion`; the stored value per row records
which wording each person agreed to.

## 6. Admin flow

All behind the existing `ADMIN_EMAIL_ALLOWLIST` check in the
`admin-applications` function and the hidden admin path.

### 6.1 Console additions

- **RSVP column** in the applications table showing Pending, Attending,
  Declined, or Checked in, with a matching filter.
- **Count strip** at the top: Admitted, Attending, Declined, Pending,
  Checked in. Computed client-side from the fetched list.
- **Row detail** shows dietary restrictions, emergency contact, waiver
  version and acceptance time, roster opt-in, check-in time and by whom.
- **Row actions**: Reset RSVP (back to pending, clears fields, with a
  confirm), Check in manually, Undo check-in.

`AdmissionsAdminPage.jsx` is already 543 lines. The RSVP column, count
strip, and export button go in as small child components in a new
`src/admissions/admin/` folder rather than growing that file further.

### 6.2 New `admin-applications` actions

The function currently handles GET (list) and PATCH (status and notes).
It gains:

| Action | Input | Effect |
|---|---|---|
| `POST { action: 'checkin', statusToken }` | token from a scan or manual lookup | Sets `checked_in_at = now()`, `checked_in_by = admin email`. Returns one of `checked_in`, `already_checked_in` (with time), `not_attending`, `not_found`, plus the person's name and school where known. |
| `POST { action: 'checkin_by_email', email }` | typed at the door | Same as above, looked up by `lower(email)` |
| `PATCH { id, rsvp_reset: true }` | application id | Sets `rsvp_status = 'pending'` and clears RSVP and check-in fields |
| `PATCH { id, checked_in: true \| false }` | application id | Manual check-in or undo |

The list endpoint's `select('*')` already returns the new columns.

### 6.3 CSV exports

Two buttons, both client-side from the already-fetched list, no new
endpoint:

- **Export admitted**: `first_name, last_name, email, school, status_url`
  for rows with `status = 'admitted'`. This is the mail-merge input.
- **Export attending**: adds `preferred_track, dietary_restrictions,
  emergency_contact_name, emergency_contact_phone, checked_in_at` for rows
  with `rsvp_status = 'attending'`, sorted by last name then first name.
  This is the day-of sheet and, printed, the door clipboard.

`status_url` is built from `window.location.origin`, so exporting from
production yields production links.

### 6.4 Door scan page

New route under the admin path: `/ops/bots-triage-7f3a/checkin`. Same
auth gate as the console.

Behaviour:

1. Opens the rear camera and continuously decodes QR codes (client-side
   library, `html5-qrcode` or equivalent).
2. On decode, extracts the token (accepts a bare UUID or a status URL),
   calls `checkin`, and shows a full-screen result for about two seconds:
   - **Green** "Checked in" with name and school
   - **Yellow** "Already checked in at HH:MM"
   - **Red** "Not attending" (no RSVP or declined)
   - **Red** "Unknown code"
3. Returns to scanning. No confirm tap.
4. Debounces the same token for five seconds so a code held in frame does
   not fire twice.
5. A text field at the bottom for manual entry by email, calling
   `checkin_by_email`.
6. A running count of checked-in for the session.

Organizers at the door must be on the allowlist and signed in on their
phones before September 12. A dry run on September 11 is part of the
plan.

### 6.5 Door fallback: the clipboard

The QR is the fast path, not the only path. A printed copy of the
attending export, sorted by last name, sits at the door. Anyone without
their code is found by name, ticked on paper, and marked in the console
via manual check-in (6.1) by an organizer with the console open. The
console's applications table already supports search by name, so the
manual path is: search, open row, Check in. Paper ticks that were not
entered live are reconciled from the sheet after the rush.

## 7. Sequencing

| Date | Ships | Gate |
|---|---|---|
| Sept 6–7 | Migration. `rsvp` action and extended `status`. Status page states, RSVP form, ticket card with QR. Waiver page with placeholder. Config and tests. | End-to-end manual test with a fake admitted application on Sept 7 |
| Sept 7 | Export admitted CSV | |
| Sept 8 | Applications close. **Waiver text final and published.** Decisions made in console. Mail merge sent. | **No decision email goes out before the waiver text is live** |
| Sept 8–9 | Console RSVP column, counts, row detail, reset, manual check-in, export attending | |
| Sept 10 | RSVP closes 23:59 ET for everyone admitted so far. Optional waitlist pulls; those people get the same link, a same-day email, and 24 hours to respond. | |
| Sept 11 | Scan page. Door dry run on organizers' phones. | |
| Sept 12 | Doors | |

Waitlist pulls after Sept 10 are covered by the 24-hour rule in 5.2, so
no config change is needed and the console needs no "RSVP on their
behalf" action, which would have conflicted with the applicant's own
waiver acceptance.

## 8. Testing

- `rsvpValidation.test.js`: field rules, attending vs declined shapes.
- `portalConfig.test.js`: RSVP deadline ordering, waiver version matches
  the legal document.
- `ApplicationStatusPage.test.jsx`: one render per state in 5.3.
- Edge function: unit tests for the `rsvp` decision table in 5.2 and the
  `checkin` result mapping in 6.2, following the pattern in
  `_shared/identity.test.js`.
- Trigger: a SQL test file exercising invariants 1–5 against a local
  database, run manually before the migration is applied.
- Manual end-to-end on Sept 7: admit a test row, open its link, RSVP, see
  the QR, scan it from the check-in page, verify the console.

## 9. Out of scope

- Email sending from the site.
- Editing an RSVP after submission (admin reset covers it).
- Team formation or teammate confirmation.
- T-shirt sizes.
- Under-18 attendance or guardian signatures.
- No-show handling or spot reallocation automation.
- Rate limiting beyond Supabase defaults.

## 10. Phase two: participants roster

Not part of this build. Recorded so the current design leaves room for it.

- **Route** `/participants`, public, linked from the landing nav.
- **Data** a read-only `roster` action on `submit-application` returning
  `first_name`, last initial, `school`, `preferred_track` for rows with
  `rsvp_status = 'attending'` and `roster_opt_in = true`. Nothing else
  leaves the server.
- **Layout** two columns, U of T (all three campuses rolled up) and
  Waterloo, each with a count. Grows live as RSVPs arrive.
- **Build trigger** once RSVPs start landing, around Sept 9. Roughly half
  a day. No schema change and no new consent step required.
