# Post-Admission RSVP, Waiver, and Door Check-in Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give an admitted applicant a way to RSVP (with waiver, emergency contact, dietary notes, roster opt-in) from the status link they already have, show them a QR ticket, and give organizers a headcount, mail-merge/door exports, and a phone scan page that checks people in.

**Architecture:** All state is new columns on `public.applications`, guarded by CHECK constraints and the existing `enforce_application_rules()` trigger. The applicant side is two new actions on the `submit-application` edge function (`rsvp`, and a wider `status`), keyed only by `status_token`. The organizer side is new actions on `admin-applications` (`checkin`, `checkin_by_email`, and `rsvp_reset` / `checked_in` on PATCH). Pure logic (deadline, validation, gate, outcome mapping) lives in Deno-free `.ts` modules tested under Vitest, exactly like `application.ts` and `_shared/identity.ts` already are.

**Tech Stack:** React 19, Vite 5, Tailwind 3, react-router 6, Supabase (Postgres + Edge Functions on Deno), Vitest 2 + Testing Library. New deps: `qrcode` (render QR to canvas), `jsqr` (decode QR from camera frames).

**Spec:** `docs/superpowers/specs/2026-09-05-post-admission-rsvp-checkin-design.md`

## Global Constraints

- **Work in `utwat-website/`**, which is its own git repo (the outer `utwat/` repo tracks it as a gitlink). All paths below are relative to `utwat-website/`. Commit there.
- **Do not touch** `supabase/migrations/202609050001_remove_trial_applications.sql` (untracked, someone else's in-progress work) or any existing migration file. New migrations only.
- **RSVP deadline, exact:** `2026-09-10T23:59:00-04:00`. Lives in two places by design (`portalConfig.rsvpDeadlineIso` and `RSVP_DEADLINE` in `supabase/functions/submit-application/rsvp.ts`); a test pins them together.
- **Late-admit grace:** an application's effective RSVP deadline is `max(RSVP_DEADLINE, decided_at + 24h)`. Server computes it; the client only reads `rsvp_deadline` from the response.
- **Waiver version, exact:** `2026-09-08`. Lives in `portalConfig.waiverVersion`, `WAIVER_VERSION` in `rsvp.ts`, and `participantWaiver.version` in `src/legal/legalContent.js`; tests pin all three together.
- **18+ only.** `over_18 !== true` blocks RSVP server-side and hides the form client-side.
- **The waiver text is a placeholder.** `participantWaiver.placeholder === true` makes the status page render "RSVP opens shortly" instead of the form. Flipping it to `false` is a deliberate, separate commit once the real text is in. Do not flip it in this plan.
- **Edge functions cannot import from `src/`** and cannot import across function directories. Only `_shared/` is shared. Duplicate small constants with a comment and pin them by test.
- **Field error keys are snake_case** (`emergency_contact_name`), matching the DB columns, on both client and server. The request body to the `rsvp` action is camelCase per the spec; the client service does the mapping.
- **No modal dialogs** (`window.confirm`, `alert`). Destructive admin actions use an inline two-step button.
- **CSV cells go through `csvEscape`** (formula-injection guard) without exception.
- Run `npm test`, `npm run lint`, and `npm run build` before every commit. All three must pass.
- Commit messages end with:
  ```
  Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01T87Dpem129y8fLCcx6Wr7o
  ```

## Scope Check

One subsystem with two halves that ship on different days: applicant side (Tasks 1–6, needed before decision emails on Sept 8) and organizer side (Tasks 7–11, needed Sept 8–11). Task 7 (admitted CSV export) is pulled forward because the mail merge depends on it. The phase-two roster page is **not** in this plan.

## File Structure

**Created:**

| File | Responsibility |
|---|---|
| `supabase/migrations/202609060001_rsvp_checkin.sql` | Enum, ten columns, CHECK constraints, trigger rules 1–5 |
| `supabase/tests/rsvp_rules.sql` | Manual SQL test of the trigger rules; runs in a transaction and rolls back |
| `supabase/functions/submit-application/rsvp.ts` | Pure: deadline math, gate, validation, row shaping, status response shaping |
| `supabase/functions/submit-application/rsvp.test.js` | |
| `supabase/functions/admin-applications/checkin.ts` | Pure: token extraction from a scan, check-in outcome, reset payload |
| `supabase/functions/admin-applications/checkin.test.js` | |
| `src/admissions/rsvpValidation.js` | Client copy of the RSVP field rules + empty form |
| `src/admissions/rsvpValidation.test.js` | |
| `src/admissions/statusView.js` | `deriveStatusView(application)` → which panel the status page shows |
| `src/admissions/statusView.test.js` | |
| `src/admissions/RsvpForm.jsx` | The RSVP form |
| `src/admissions/TicketCard.jsx` | Name/school/track + QR canvas |
| `src/admissions/RsvpBadge.jsx` | Pending / Attending / Declined / Checked In pill |
| `src/pages/ApplicationStatusPage.test.jsx` | One render per status-page state |
| `src/admissions/admin/exports.js` | `csvEscape`, `toCsv`, the three CSV builders, `downloadCsv` |
| `src/admissions/admin/exports.test.js` | |
| `src/admissions/admin/rsvpSummary.js` | `summarizeRsvps(applications)` counts |
| `src/admissions/admin/rsvpSummary.test.js` | |
| `src/admissions/admin/RsvpSummary.jsx` | Count strip |
| `src/admissions/admin/scan.js` | `parseScannedToken`, `describeCheckin` (result → colour/title/detail) |
| `src/admissions/admin/scan.test.js` | |
| `src/admissions/admin/useQrScanner.js` | Camera + `jsqr` decode loop hook |
| `src/pages/CheckInPage.jsx` | Door scan page |

**Modified:** `package.json`, `src/admissions/portalConfig.js`, `src/admissions/portalConfig.test.js`, `src/legal/legalContent.js`, `src/legal/legalContent.test.jsx`, `src/App.jsx`, `src/admissions/applicationService.js`, `src/pages/ApplicationStatusPage.jsx`, `src/pages/AdmissionsAdminPage.jsx`, `supabase/functions/submit-application/index.ts`, `supabase/functions/admin-applications/index.ts`, `README.md`.

---

### Task 1: Migration — columns, constraints, trigger rules

**Files:**
- Create: `supabase/migrations/202609060001_rsvp_checkin.sql`
- Create: `supabase/tests/rsvp_rules.sql`

**Interfaces:**
- Produces: columns `rsvp_status` (enum `public.rsvp_status`: `pending|attending|declined`), `rsvp_at`, `dietary_restrictions`, `emergency_contact_name`, `emergency_contact_phone`, `waiver_accepted_at`, `waiver_version`, `roster_opt_in`, `checked_in_at`, `checked_in_by` on `public.applications`. Every later task reads or writes these names verbatim.

- [ ] **Step 1: Write the migration**

```sql
-- ---------------------------------------------------------------------------
-- Post-admission state: RSVP, waiver acceptance, and door check-in.
--
-- All of it lives on the application row. There is no account behind an
-- applicant, so the status_token that already identifies a row is also what
-- identifies an RSVP; a separate table would only add a join with nothing to
-- key it on. Every column is additive with a default, so this applies to the
-- live table without touching existing rows.
--
-- Two kinds of rule:
--   * CHECK constraints for anything expressible on one row (an attending RSVP
--     carries a waiver and an emergency contact; nobody is checked in who is
--     not attending).
--   * The existing enforce_application_rules() trigger for transitions, which
--     need OLD alongside NEW: RSVP only while admitted, RSVP frozen once given
--     except for an admin reset, and everything wiped if a decision is reverted.
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'rsvp_status') then
    create type public.rsvp_status as enum ('pending', 'attending', 'declined');
  end if;
end
$$;

alter table public.applications
  add column if not exists rsvp_status public.rsvp_status not null default 'pending',
  add column if not exists rsvp_at timestamptz,
  add column if not exists dietary_restrictions text,
  add column if not exists emergency_contact_name text,
  add column if not exists emergency_contact_phone text,
  add column if not exists waiver_accepted_at timestamptz,
  add column if not exists waiver_version text,
  add column if not exists roster_opt_in boolean not null default false,
  add column if not exists checked_in_at timestamptz,
  add column if not exists checked_in_by text;

-- Same caps the edge function enforces, so an oversized value is a field error
-- there rather than a constraint violation here.
alter table public.applications
  add constraint applications_dietary_len
    check (dietary_restrictions is null or char_length(dietary_restrictions) <= 500),
  add constraint applications_emergency_name_len
    check (emergency_contact_name is null or char_length(emergency_contact_name) <= 200),
  add constraint applications_emergency_phone_len
    check (emergency_contact_phone is null or char_length(emergency_contact_phone) <= 50),
  add constraint applications_waiver_version_len
    check (waiver_version is null or char_length(waiver_version) <= 50),
  add constraint applications_checked_in_by_len
    check (checked_in_by is null or char_length(checked_in_by) <= 320),
  -- Rule 3: attending means the waiver was accepted and a contact was given.
  add constraint applications_attending_complete
    check (
      rsvp_status <> 'attending'
      or (
        waiver_accepted_at is not null
        and waiver_version is not null
        and emergency_contact_name is not null
        and emergency_contact_phone is not null
      )
    ),
  -- Rule 4: only an attending person can be checked in.
  add constraint applications_checkin_requires_attending
    check (checked_in_at is null or rsvp_status = 'attending');

create index if not exists applications_rsvp_status_idx
  on public.applications (rsvp_status);

-- Rules 1, 2 and 5 compare OLD with NEW, so they live in the trigger. The
-- identity and link logic below is unchanged from 202608260003.
create or replace function public.enforce_application_rules()
returns trigger
language plpgsql
as $$
declare
  uid uuid := auth.uid();
  claim_email text;
  link_value text;
  rsvp_changed boolean;
  rsvp_cleared boolean;
begin
  if uid is not null then
    if tg_op = 'INSERT' then
      new.user_id := uid;
      claim_email :=
        nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email';
      if claim_email is not null then
        new.email := claim_email;
      end if;
    end if;

    if new.resume_path is not null
       and position((uid::text || '/') in new.resume_path) <> 1 then
      raise exception 'resume_path must be within your own folder';
    end if;
  end if;

  if new.links is not null then
    for link_value in select value from jsonb_each_text(new.links)
    loop
      if link_value is not null
         and length(btrim(link_value)) > 0
         and lower(btrim(link_value)) !~ '^https?://' then
        raise exception
          'Links must be empty or start with http:// or https://';
      end if;
    end loop;
  end if;

  -- ---- RSVP / check-in transitions ----------------------------------------
  if tg_op = 'INSERT' then
    -- A brand-new application cannot arrive already answered or checked in.
    if new.rsvp_status <> 'pending' or new.checked_in_at is not null then
      raise exception 'A new application cannot carry an RSVP or check-in';
    end if;
    return new;
  end if;

  rsvp_changed :=
    new.rsvp_status is distinct from old.rsvp_status
    or new.rsvp_at is distinct from old.rsvp_at
    or new.dietary_restrictions is distinct from old.dietary_restrictions
    or new.emergency_contact_name is distinct from old.emergency_contact_name
    or new.emergency_contact_phone is distinct from old.emergency_contact_phone
    or new.waiver_accepted_at is distinct from old.waiver_accepted_at
    or new.waiver_version is distinct from old.waiver_version
    or new.roster_opt_in is distinct from old.roster_opt_in;

  -- Rule 5: a decision that is reverted takes the RSVP and check-in with it.
  -- Someone who is no longer admitted has no RSVP, whatever the caller sent.
  if old.status = 'admitted' and new.status <> 'admitted' then
    new.rsvp_status := 'pending';
    new.rsvp_at := null;
    new.dietary_restrictions := null;
    new.emergency_contact_name := null;
    new.emergency_contact_phone := null;
    new.waiver_accepted_at := null;
    new.waiver_version := null;
    new.roster_opt_in := false;
    new.checked_in_at := null;
    new.checked_in_by := null;
    return new;
  end if;

  if rsvp_changed then
    -- Rule 1: nobody RSVPs who is not admitted.
    if new.status <> 'admitted' then
      raise exception 'RSVP fields can only change on an admitted application';
    end if;

    -- Rule 2: an RSVP is final. The one way out is the admin reset, which
    -- puts every field back to its default -- and clears check-in with it,
    -- since a pending RSVP cannot be checked in (see the CHECK above).
    if old.rsvp_status <> 'pending' then
      rsvp_cleared :=
        new.rsvp_status = 'pending'
        and new.rsvp_at is null
        and new.dietary_restrictions is null
        and new.emergency_contact_name is null
        and new.emergency_contact_phone is null
        and new.waiver_accepted_at is null
        and new.waiver_version is null
        and new.roster_opt_in = false;
      if not rsvp_cleared then
        raise exception 'An RSVP is final once submitted; reset it first';
      end if;
      new.checked_in_at := null;
      new.checked_in_by := null;
    end if;
  end if;

  return new;
end;
$$;
```

- [ ] **Step 2: Write the SQL test**

`supabase/tests/rsvp_rules.sql` — run with `psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rsvp_rules.sql` against a local `supabase start` database after `supabase db reset`. Every block ends in ROLLBACK; nothing persists.

```sql
-- Exercises rules 1-5 from the spec against a real Postgres. Manual: run it
-- after `supabase db reset` on a local stack. It creates one row, tries each
-- forbidden transition inside a savepoint, and asserts the error. Rolls back.
begin;

insert into public.applications (email, status, first_name, last_name, school, over_18, submitted_at)
values ('rsvp-test@example.com', 'submitted', 'Test', 'Person', 'University of Waterloo', true, now());

-- Rule 1: cannot RSVP while merely submitted.
do $$
begin
  begin
    update public.applications set rsvp_status = 'declined', rsvp_at = now()
    where email = 'rsvp-test@example.com';
    raise exception 'FAIL rule 1: RSVP accepted on a submitted application';
  exception when others then
    if sqlerrm not like 'RSVP fields can only change%' then raise; end if;
  end;
end $$;

update public.applications set status = 'admitted', decided_at = now(), decided_by = 'admin@example.com'
where email = 'rsvp-test@example.com';

-- Rule 3: attending without waiver/contact is refused by the CHECK.
do $$
begin
  begin
    update public.applications set rsvp_status = 'attending', rsvp_at = now()
    where email = 'rsvp-test@example.com';
    raise exception 'FAIL rule 3: attending without waiver accepted';
  exception when check_violation then null;
  end;
end $$;

-- Rule 4: cannot check in while pending.
do $$
begin
  begin
    update public.applications set checked_in_at = now(), checked_in_by = 'door@example.com'
    where email = 'rsvp-test@example.com';
    raise exception 'FAIL rule 4: checked in while RSVP pending';
  exception when check_violation then null;
  end;
end $$;

-- A complete attending RSVP is accepted.
update public.applications set
  rsvp_status = 'attending', rsvp_at = now(),
  emergency_contact_name = 'Parent', emergency_contact_phone = '6475550100',
  waiver_accepted_at = now(), waiver_version = '2026-09-08', roster_opt_in = true
where email = 'rsvp-test@example.com';

-- Rule 2: editing after the fact is refused.
do $$
begin
  begin
    update public.applications set dietary_restrictions = 'changed my mind'
    where email = 'rsvp-test@example.com';
    raise exception 'FAIL rule 2: RSVP edited after submission';
  exception when others then
    if sqlerrm not like 'An RSVP is final%' then raise; end if;
  end;
end $$;

-- Check-in works on an attending row.
update public.applications set checked_in_at = now(), checked_in_by = 'door@example.com'
where email = 'rsvp-test@example.com';

-- Rule 2 (reset path): the full reset is allowed and clears check-in too.
update public.applications set
  rsvp_status = 'pending', rsvp_at = null, dietary_restrictions = null,
  emergency_contact_name = null, emergency_contact_phone = null,
  waiver_accepted_at = null, waiver_version = null, roster_opt_in = false
where email = 'rsvp-test@example.com';

do $$
declare r record;
begin
  select checked_in_at, checked_in_by into r from public.applications where email = 'rsvp-test@example.com';
  if r.checked_in_at is not null or r.checked_in_by is not null then
    raise exception 'FAIL rule 2: reset did not clear check-in';
  end if;
end $$;

-- Rule 5: reverting the decision wipes everything.
update public.applications set
  rsvp_status = 'declined', rsvp_at = now()
where email = 'rsvp-test@example.com';
update public.applications set status = 'waitlisted'
where email = 'rsvp-test@example.com';

do $$
declare r record;
begin
  select rsvp_status, rsvp_at into r from public.applications where email = 'rsvp-test@example.com';
  if r.rsvp_status <> 'pending' or r.rsvp_at is not null then
    raise exception 'FAIL rule 5: reverting the decision left an RSVP behind';
  end if;
end $$;

select 'rsvp_rules: all assertions passed' as result;
rollback;
```

- [ ] **Step 3: Run it locally if a local stack is available**

Run: `npx supabase@latest start` (skip if Docker is unavailable), then `npx supabase@latest db reset`, then the psql command above.
Expected: last line `rsvp_rules: all assertions passed`. If no local stack exists on this machine, record that in the commit body and rely on Task 3's manual end-to-end test.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/202609060001_rsvp_checkin.sql supabase/tests/rsvp_rules.sql
git commit -m "Add RSVP and check-in columns with transition rules"
```

---

### Task 2: `rsvp.ts` — pure RSVP logic for the edge function

**Files:**
- Create: `supabase/functions/submit-application/rsvp.ts`
- Create: `supabase/functions/submit-application/rsvp.test.js`

**Interfaces:**
- Consumes: `str` from `./application.ts`.
- Produces (used by Task 3 and pinned by Task 4):
  - `RSVP_DEADLINE: string`, `WAIVER_VERSION: string`, `LATE_ADMIT_GRACE_MS: number`
  - `STATUS_COLUMNS: string` (PostgREST select list)
  - `effectiveRsvpDeadline(decidedAt: string | null): Date`
  - `rsvpGate(row, now?): 'not admitted' | 'underage' | 'rsvp closed' | 'already responded' | null`
  - `validateRsvp(body): { errors: Record<string,string>, values: RsvpValues }`
  - `toRsvpUpdate(values, now?, waiverVersion?)`
  - `toStatusResponse(row)`: drops `decided_at`, adds `rsvp_deadline` (ISO string or null)

- [ ] **Step 1: Write the failing tests**

```js
import { describe, it, expect } from 'vitest'
import {
  LATE_ADMIT_GRACE_MS,
  RSVP_DEADLINE,
  STATUS_COLUMNS,
  effectiveRsvpDeadline,
  rsvpGate,
  toRsvpUpdate,
  toStatusResponse,
  validateRsvp,
} from './rsvp.ts'

const DEADLINE = new Date(RSVP_DEADLINE)
const before = new Date(DEADLINE.getTime() - 60_000)
const after = new Date(DEADLINE.getTime() + 60_000)

const admitted = (overrides = {}) => ({
  status: 'admitted',
  submitted_at: '2026-09-01T12:00:00Z',
  first_name: 'Ada',
  school: 'University of Waterloo',
  preferred_track: 'Robotics',
  over_18: true,
  decided_at: '2026-09-08T15:00:00-04:00',
  rsvp_status: 'pending',
  rsvp_at: null,
  dietary_restrictions: null,
  emergency_contact_name: null,
  emergency_contact_phone: null,
  roster_opt_in: false,
  checked_in_at: null,
  ...overrides,
})

const attendingBody = (overrides = {}) => ({
  attending: true,
  dietaryRestrictions: 'vegetarian',
  emergencyContactName: 'Byron Lovelace',
  emergencyContactPhone: '+1 647 555 0100',
  waiverAccepted: true,
  rosterOptIn: true,
  ...overrides,
})

describe('effectiveRsvpDeadline', () => {
  it('is the global deadline for anyone admitted before it', () => {
    expect(effectiveRsvpDeadline('2026-09-08T15:00:00-04:00').getTime()).toBe(DEADLINE.getTime())
    expect(effectiveRsvpDeadline(null).getTime()).toBe(DEADLINE.getTime())
  })

  // The waitlist case: admitted after the window closed, so the window is
  // 24 hours from the moment the admin pressed Admit.
  it('gives a late admit 24 hours from their decision', () => {
    const decided = new Date(DEADLINE.getTime() + 3 * 60 * 60 * 1000)
    expect(effectiveRsvpDeadline(decided.toISOString()).getTime())
      .toBe(decided.getTime() + LATE_ADMIT_GRACE_MS)
  })

  it('never shortens the global deadline for an early admit', () => {
    const decided = new Date(DEADLINE.getTime() - 3 * 24 * 60 * 60 * 1000)
    expect(effectiveRsvpDeadline(decided.toISOString()).getTime()).toBe(DEADLINE.getTime())
  })
})

describe('rsvpGate', () => {
  it('lets an admitted adult with no RSVP through before the deadline', () => {
    expect(rsvpGate(admitted(), before)).toBeNull()
  })

  it('refuses anyone not admitted', () => {
    for (const status of ['submitted', 'waitlisted', 'rejected', 'incomplete']) {
      expect(rsvpGate(admitted({ status }), before)).toBe('not admitted')
    }
  })

  it('refuses under-18s', () => {
    expect(rsvpGate(admitted({ over_18: false }), before)).toBe('underage')
  })

  it('refuses after the deadline', () => {
    expect(rsvpGate(admitted(), after)).toBe('rsvp closed')
  })

  it('still accepts during the final minute', () => {
    expect(rsvpGate(admitted(), new Date(DEADLINE.getTime() - 1))).toBeNull()
  })

  it('accepts a late admit inside their grace window', () => {
    const decided = new Date(DEADLINE.getTime() + 60 * 60 * 1000)
    const row = admitted({ decided_at: decided.toISOString() })
    expect(rsvpGate(row, new Date(decided.getTime() + 60 * 60 * 1000))).toBeNull()
    expect(rsvpGate(row, new Date(decided.getTime() + LATE_ADMIT_GRACE_MS + 1))).toBe('rsvp closed')
  })

  it('refuses a second RSVP', () => {
    expect(rsvpGate(admitted({ rsvp_status: 'attending' }), before)).toBe('already responded')
    expect(rsvpGate(admitted({ rsvp_status: 'declined' }), before)).toBe('already responded')
  })

  it('checks in the order the page can explain: status, age, deadline, duplicate', () => {
    expect(rsvpGate(admitted({ status: 'rejected', over_18: false }), after)).toBe('not admitted')
    expect(rsvpGate(admitted({ over_18: false, rsvp_status: 'declined' }), after)).toBe('underage')
  })
})

describe('validateRsvp', () => {
  it('accepts a complete attending RSVP', () => {
    const { errors, values } = validateRsvp(attendingBody())
    expect(errors).toEqual({})
    expect(values).toEqual({
      attending: true,
      dietary_restrictions: 'vegetarian',
      emergency_contact_name: 'Byron Lovelace',
      emergency_contact_phone: '+1 647 555 0100',
      waiver_accepted: true,
      roster_opt_in: true,
    })
  })

  it('requires an explicit yes or no', () => {
    expect(validateRsvp({}).errors.attending).toBeTruthy()
    expect(validateRsvp({ attending: 'yes' }).errors.attending).toBeTruthy()
  })

  it('needs nothing else from a decline', () => {
    const { errors, values } = validateRsvp({ attending: false })
    expect(errors).toEqual({})
    expect(values.attending).toBe(false)
  })

  it('requires the waiver and an emergency contact to attend', () => {
    const { errors } = validateRsvp({ attending: true })
    expect(Object.keys(errors).sort()).toEqual([
      'emergency_contact_name',
      'emergency_contact_phone',
      'waiver_accepted',
    ])
  })

  it('wants at least seven digits in the phone number', () => {
    expect(validateRsvp(attendingBody({ emergencyContactPhone: '555-01' })).errors.emergency_contact_phone).toBeTruthy()
    expect(validateRsvp(attendingBody({ emergencyContactPhone: '(647) 555-0100' })).errors).toEqual({})
  })

  it('caps lengths at the CHECK constraints', () => {
    expect(validateRsvp(attendingBody({ dietaryRestrictions: 'x'.repeat(501) })).errors.dietary_restrictions).toBeTruthy()
    expect(validateRsvp(attendingBody({ emergencyContactName: 'x'.repeat(201) })).errors.emergency_contact_name).toBeTruthy()
    expect(validateRsvp(attendingBody({ emergencyContactPhone: '1'.repeat(51) })).errors.emergency_contact_phone).toBeTruthy()
  })

  it('treats a non-boolean waiver or roster flag as false', () => {
    expect(validateRsvp(attendingBody({ waiverAccepted: 'true' })).errors.waiver_accepted).toBeTruthy()
    expect(validateRsvp(attendingBody({ rosterOptIn: 'yes' })).values.roster_opt_in).toBe(false)
  })
})

describe('toRsvpUpdate', () => {
  const now = new Date('2026-09-09T10:00:00Z')

  it('writes only the decline for a no', () => {
    expect(toRsvpUpdate({ attending: false }, now)).toEqual({
      rsvp_status: 'declined',
      rsvp_at: now.toISOString(),
    })
  })

  it('stamps the waiver time and version for a yes', () => {
    const { values } = validateRsvp(attendingBody({ dietaryRestrictions: '' }))
    expect(toRsvpUpdate(values, now, '2026-09-08')).toEqual({
      rsvp_status: 'attending',
      rsvp_at: now.toISOString(),
      dietary_restrictions: null,
      emergency_contact_name: 'Byron Lovelace',
      emergency_contact_phone: '+1 647 555 0100',
      waiver_accepted_at: now.toISOString(),
      waiver_version: '2026-09-08',
      roster_opt_in: true,
    })
  })
})

describe('toStatusResponse', () => {
  it('replaces decided_at with the computed deadline', () => {
    const out = toStatusResponse(admitted())
    expect(out.decided_at).toBeUndefined()
    expect(out.rsvp_deadline).toBe(DEADLINE.toISOString())
    expect(out.first_name).toBe('Ada')
  })

  it('has no deadline for anyone not admitted', () => {
    expect(toStatusResponse(admitted({ status: 'submitted' })).rsvp_deadline).toBeNull()
  })

  it('selects every column the response needs and no more', () => {
    const cols = STATUS_COLUMNS.split(',').map((c) => c.trim()).sort()
    expect(cols).toEqual([
      'checked_in_at', 'decided_at', 'dietary_restrictions', 'emergency_contact_name',
      'emergency_contact_phone', 'first_name', 'over_18', 'preferred_track', 'roster_opt_in',
      'rsvp_at', 'rsvp_status', 'school', 'status', 'submitted_at',
    ])
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run supabase/functions/submit-application/rsvp.test.js`
Expected: FAIL, cannot resolve `./rsvp.ts`.

- [ ] **Step 3: Write `rsvp.ts`**

```ts
// The pure half of the RSVP: who may respond, what a valid response is, and
// what row it becomes. Split from index.ts for the same reason application.ts
// is -- it runs under vitest with no Deno and no Postgres, and the failures
// here are silent ones (a deadline off by a timezone, a waiver never stamped).

import { str } from './application.ts'

// Pinned to portalConfig.rsvpDeadlineIso by src/admissions/portalConfig.test.js.
export const RSVP_DEADLINE = '2026-09-10T23:59:00-04:00'

// Pinned to portalConfig.waiverVersion and participantWaiver.version by the
// same test. Bump all three together when the waiver wording changes; the
// value stored on each row says which wording that person accepted.
export const WAIVER_VERSION = '2026-09-08'

// Someone admitted from the waitlist after the global deadline gets this long
// from the moment the admin pressed Admit.
export const LATE_ADMIT_GRACE_MS = 24 * 60 * 60 * 1000

export const MAX_DIETARY_LENGTH = 500
export const MAX_CONTACT_NAME_LENGTH = 200
export const MAX_CONTACT_PHONE_LENGTH = 50
export const MIN_PHONE_DIGITS = 7

export const STATUS_COLUMNS = [
  'status',
  'submitted_at',
  'first_name',
  'school',
  'preferred_track',
  'over_18',
  'decided_at',
  'rsvp_status',
  'rsvp_at',
  'dietary_restrictions',
  'emergency_contact_name',
  'emergency_contact_phone',
  'roster_opt_in',
  'checked_in_at',
].join(', ')

export type RsvpStatus = 'pending' | 'attending' | 'declined'

export type StatusRow = {
  status: string
  submitted_at: string | null
  first_name: string | null
  school: string | null
  preferred_track: string | null
  over_18: boolean
  decided_at: string | null
  rsvp_status: RsvpStatus
  rsvp_at: string | null
  dietary_restrictions: string | null
  emergency_contact_name: string | null
  emergency_contact_phone: string | null
  roster_opt_in: boolean
  checked_in_at: string | null
}

export function effectiveRsvpDeadline(decidedAt: string | null): Date {
  const base = new Date(RSVP_DEADLINE)
  if (!decidedAt) return base
  const grace = new Date(new Date(decidedAt).getTime() + LATE_ADMIT_GRACE_MS)
  return grace > base ? grace : base
}

export type RsvpGateError =
  | 'not admitted'
  | 'underage'
  | 'rsvp closed'
  | 'already responded'

/** Ordered so the first failure is the one the page can best explain. */
export function rsvpGate(row: StatusRow, now: Date = new Date()): RsvpGateError | null {
  if (row.status !== 'admitted') return 'not admitted'
  if (row.over_18 !== true) return 'underage'
  if (now > effectiveRsvpDeadline(row.decided_at)) return 'rsvp closed'
  if (row.rsvp_status !== 'pending') return 'already responded'
  return null
}

export type RsvpValues = {
  attending: boolean
  dietary_restrictions: string
  emergency_contact_name: string
  emergency_contact_phone: string
  waiver_accepted: boolean
  roster_opt_in: boolean
}

/**
 * Field -> message, empty when acceptable. Keys are the column names so the
 * client can drop them straight onto its form, whose state uses the same keys.
 */
export function validateRsvp(body: Record<string, unknown>): {
  errors: Record<string, string>
  values: RsvpValues
} {
  const values: RsvpValues = {
    attending: body.attending === true,
    dietary_restrictions: str(body.dietaryRestrictions),
    emergency_contact_name: str(body.emergencyContactName),
    emergency_contact_phone: str(body.emergencyContactPhone),
    waiver_accepted: body.waiverAccepted === true,
    roster_opt_in: body.rosterOptIn === true,
  }
  const errors: Record<string, string> = {}

  if (typeof body.attending !== 'boolean') {
    errors.attending = 'Tell us whether you are attending.'
  }
  if (!values.attending) return { errors, values }

  if (!values.emergency_contact_name) {
    errors.emergency_contact_name = 'This field is required.'
  } else if (values.emergency_contact_name.length > MAX_CONTACT_NAME_LENGTH) {
    errors.emergency_contact_name = `Must be ${MAX_CONTACT_NAME_LENGTH} characters or fewer.`
  }

  const digits = values.emergency_contact_phone.replace(/\D/g, '').length
  if (!values.emergency_contact_phone) {
    errors.emergency_contact_phone = 'This field is required.'
  } else if (values.emergency_contact_phone.length > MAX_CONTACT_PHONE_LENGTH) {
    errors.emergency_contact_phone = `Must be ${MAX_CONTACT_PHONE_LENGTH} characters or fewer.`
  } else if (digits < MIN_PHONE_DIGITS) {
    errors.emergency_contact_phone = 'Enter a phone number with at least 7 digits.'
  }

  if (values.dietary_restrictions.length > MAX_DIETARY_LENGTH) {
    errors.dietary_restrictions = `Must be ${MAX_DIETARY_LENGTH} characters or fewer.`
  }

  if (!values.waiver_accepted) {
    errors.waiver_accepted = 'You must accept the waiver to attend.'
  }

  return { errors, values }
}

export function toRsvpUpdate(
  values: Pick<RsvpValues, 'attending'> & Partial<RsvpValues>,
  now: Date = new Date(),
  waiverVersion: string = WAIVER_VERSION,
) {
  const rsvp_at = now.toISOString()
  if (!values.attending) {
    return { rsvp_status: 'declined' as const, rsvp_at }
  }
  return {
    rsvp_status: 'attending' as const,
    rsvp_at,
    dietary_restrictions: values.dietary_restrictions || null,
    emergency_contact_name: values.emergency_contact_name,
    emergency_contact_phone: values.emergency_contact_phone,
    waiver_accepted_at: rsvp_at,
    waiver_version: waiverVersion,
    roster_opt_in: values.roster_opt_in === true,
  }
}

/**
 * What the status endpoint returns. decided_at exists only to compute the
 * deadline and is not something a shared bookmark needs to disclose.
 */
export function toStatusResponse(row: StatusRow) {
  const { decided_at, ...rest } = row
  return {
    ...rest,
    rsvp_deadline:
      row.status === 'admitted' ? effectiveRsvpDeadline(decided_at).toISOString() : null,
  }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run supabase/functions/submit-application/rsvp.test.js`
Expected: PASS, all tests.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/submit-application/rsvp.ts supabase/functions/submit-application/rsvp.test.js
git commit -m "Add pure RSVP gate, validation and row shaping"
```

---

### Task 3: Wire `rsvp` and the wider `status` into `submit-application`

**Files:**
- Modify: `supabase/functions/submit-application/index.ts:15-27` (header), `:133-160` (status action)

**Interfaces:**
- Consumes: everything from Task 2.
- Produces: `POST { action: 'status', statusToken }` → `{ application: toStatusResponse(row) }`; `POST { action: 'rsvp', statusToken, attending, dietaryRestrictions, emergencyContactName, emergencyContactPhone, waiverAccepted, rosterOptIn }` → `{ application }` on 200, `{ error }` on 400/403/404/409, `{ error: 'validation failed', errors }` on 422. Task 5's client depends on these exact shapes.

- [ ] **Step 1: Update the header comment**

Replace lines 15–19 with:

```ts
// Four actions:
//   resume-upload-url  -> a short-lived signed URL, so a 10 MB PDF goes
//                         browser -> storage directly and never through here
//   submit             -> validate, insert, return the status token
//   status             -> read one row back by that token
//   rsvp               -> an admitted applicant's one-shot RSVP, by that token
//
// Turnstile gates the two that write a NEW row or object. `status` and `rsvp`
// do not take one: both are bounded to the single row an unguessable token
// already names, and a captcha on them would mean solving a widget to find
// out whether you got in. The pure parts of `rsvp` live in ./rsvp.ts.
```

- [ ] **Step 2: Add the import**

After the `./application.ts` import block:

```ts
import {
  STATUS_COLUMNS,
  rsvpGate,
  toRsvpUpdate,
  toStatusResponse,
  validateRsvp,
  type StatusRow,
} from './rsvp.ts'
```

- [ ] **Step 3: Widen `status` and add `rsvp`**

Replace the whole `if (action === 'status') { ... }` block with:

```ts
    // --- status / rsvp ------------------------------------------------------
    // Both are keyed by the token alone. The column list is STATUS_COLUMNS:
    // enough to render the status page and the ticket, nothing that would turn
    // a leaked bookmark into a data disclosure.
    if (action === 'status' || action === 'rsvp') {
      if (typeof statusToken !== 'string' || !statusToken) {
        return json(cors, { error: 'missing token' }, 400)
      }
      const token = statusToken.trim()
      if (!STATUS_TOKEN_RE.test(token)) {
        return json(cors, { error: 'not found' }, 404)
      }
      const { data, error } = await admin
        .from('applications')
        .select(STATUS_COLUMNS)
        .eq('status_token', token)
        .maybeSingle()
      if (error) throw error
      if (!data) return json(cors, { error: 'not found' }, 404)
      const row = data as unknown as StatusRow

      if (action === 'status') {
        return json(cors, { application: toStatusResponse(row) })
      }

      const gate = rsvpGate(row)
      if (gate) {
        return json(cors, { error: gate }, gate === 'already responded' ? 409 : 403)
      }

      const { errors, values } = validateRsvp(payload as Record<string, unknown>)
      if (Object.keys(errors).length > 0) {
        return json(cors, { error: 'validation failed', errors }, 422)
      }

      // The rsvp_status filter makes two simultaneous submits race safely:
      // exactly one matches the pending row, the other updates nothing.
      const { data: updated, error: updateError } = await admin
        .from('applications')
        .update(toRsvpUpdate(values))
        .eq('status_token', token)
        .eq('rsvp_status', 'pending')
        .select(STATUS_COLUMNS)
        .maybeSingle()
      if (updateError) throw updateError
      if (!updated) return json(cors, { error: 'already responded' }, 409)
      return json(cors, { application: toStatusResponse(updated as unknown as StatusRow) })
    }
```

- [ ] **Step 4: Type-check under Deno if available**

Run: `deno check supabase/functions/submit-application/index.ts` (skip if `deno` is not installed; note it in the commit body). Also run `npm test` — Task 2's tests still import `rsvp.ts` and must still pass.
Expected: no type errors; tests PASS.

- [ ] **Step 5: Deploy and run the manual end-to-end check**

Requires the Supabase CLI logged in to project `onuqjftrljosetjkqduq` (the organizer does this; `npx supabase@latest login`).

```bash
npx supabase@latest db push
npx supabase@latest functions deploy submit-application
```

Then with a test application row set to `admitted` (use the console), from a shell:

```bash
curl -s -X POST "$SUPABASE_URL/functions/v1/submit-application" \
  -H "apikey: $SUPABASE_ANON_KEY" -H "Content-Type: application/json" \
  -d '{"action":"status","statusToken":"<token>"}'
# expect rsvp_status "pending" and an rsvp_deadline of 2026-09-11T03:59:00.000Z

curl -s -X POST "$SUPABASE_URL/functions/v1/submit-application" \
  -H "apikey: $SUPABASE_ANON_KEY" -H "Content-Type: application/json" \
  -d '{"action":"rsvp","statusToken":"<token>","attending":true,"emergencyContactName":"Test","emergencyContactPhone":"6475550100","waiverAccepted":true,"rosterOptIn":false}'
# expect rsvp_status "attending"; repeat -> 409 already responded
```

If the deploy step cannot be run in this session, say so in the commit body and leave it on the Sept 7 checklist in Task 12.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/submit-application/index.ts
git commit -m "Serve RSVP state on status and accept a one-shot rsvp action"
```

---

### Task 4: Config, waiver document, and the pins that hold them together

**Files:**
- Modify: `src/admissions/portalConfig.js:11` (after `applicationDeadlineIso`), `:70-78` (statuses / policyLinks), end of file
- Modify: `src/admissions/portalConfig.test.js` (append)
- Modify: `src/legal/legalContent.js:197` (`legalDocuments`) and append the waiver document
- Modify: `src/legal/legalContent.test.jsx` (append)
- Modify: `src/App.jsx:28-29` (add the `/waiver` route)

**Interfaces:**
- Produces: `portalConfig.rsvpDeadlineIso`, `portalConfig.waiverVersion`, `portalConfig.minimumAge`, `portalConfig.rsvpStatuses` (keys `pending|attending|declined|checked_in`, each `{ label, tone }`), `portalConfig.policyLinks.waiver = '/waiver'`, `rsvpBadgeKey(application)`, `formatRsvpDeadline(iso)`; `participantWaiver` (`{ slug: 'waiver', title, updated, version, placeholder: true, intro, sections }`) exported from `legalContent.js` and included in `legalDocuments`.

- [ ] **Step 1: Write the failing config tests** (append to `portalConfig.test.js`)

```js
import { RSVP_DEADLINE, WAIVER_VERSION } from '../../supabase/functions/submit-application/rsvp.ts'
import { participantWaiver } from '../legal/legalContent'
import { rsvpBadgeKey, formatRsvpDeadline } from './portalConfig'

/**
 * The RSVP deadline and the waiver version each exist in more than one place
 * on purpose (the edge function cannot import src/). These hold the copies
 * together, the way the application deadline is held above.
 */
describe('rsvp deadline', () => {
  const rsvpDeadline = new Date(portalConfig.rsvpDeadlineIso)

  it('parses, and is stated in Toronto time', () => {
    expect(Number.isNaN(rsvpDeadline.getTime())).toBe(false)
    expect(portalConfig.rsvpDeadlineIso).toMatch(/-0[45]:00$/)
  })

  it('falls after applications close and before the event starts', () => {
    expect(rsvpDeadline.getTime()).toBeGreaterThan(deadline.getTime())
    expect(rsvpDeadline.getTime()).toBeLessThan(eventStart.getTime())
  })

  it('matches the copy the edge function enforces', () => {
    expect(new Date(RSVP_DEADLINE).toISOString()).toBe(rsvpDeadline.toISOString())
  })

  it('formats as the configured day in Toronto, not a shifted one', () => {
    const [, , day] = portalConfig.rsvpDeadlineIso.slice(0, 10).split('-')
    expect(formatRsvpDeadline(portalConfig.rsvpDeadlineIso)).toContain(String(Number(day)))
  })
})

describe('waiver version', () => {
  it('is one value in all three places', () => {
    expect(WAIVER_VERSION).toBe(portalConfig.waiverVersion)
    expect(participantWaiver.version).toBe(portalConfig.waiverVersion)
  })

  it('is a date, so the stored value on a row reads as "which wording"', () => {
    expect(portalConfig.waiverVersion).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

describe('rsvpBadgeKey', () => {
  it('shows checked in ahead of attending', () => {
    expect(rsvpBadgeKey({ rsvp_status: 'attending', checked_in_at: '2026-09-12T13:00:00Z' })).toBe('checked_in')
    expect(rsvpBadgeKey({ rsvp_status: 'attending', checked_in_at: null })).toBe('attending')
    expect(rsvpBadgeKey({ rsvp_status: 'declined' })).toBe('declined')
    expect(rsvpBadgeKey({})).toBe('pending')
  })

  it('has a label and tone for every key it can return', () => {
    for (const key of ['pending', 'attending', 'declined', 'checked_in']) {
      expect(portalConfig.rsvpStatuses[key].label).toBeTruthy()
      expect(portalConfig.rsvpStatuses[key].tone).toBeTruthy()
    }
  })
})
```

Add `participantWaiver` to the existing `policy links` block in `legalContent.test.jsx`:

```js
  it('the waiver is routed and linked like the other two', () => {
    expect(portalConfig.policyLinks.waiver).toBe(`/${participantWaiver.slug}`);
    const app = readFileSync(join('src', 'App.jsx'), 'utf8');
    expect(app).toContain(`path="${portalConfig.policyLinks.waiver}"`);
  });

  // The RSVP form must not render against placeholder text. statusView.js
  // reads this flag; this pins that the flag exists and is a boolean.
  it('the waiver declares whether it is still a placeholder', () => {
    expect(typeof participantWaiver.placeholder).toBe('boolean');
    expect(participantWaiver.version).toBe(portalConfig.waiverVersion);
  });
```

(Import `participantWaiver` alongside `privacyPolicy, termsOfService, legalDocuments` at the top of that test file.)

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/admissions/portalConfig.test.js src/legal/legalContent.test.jsx`
Expected: FAIL on missing exports.

- [ ] **Step 3: Extend `portalConfig.js`**

After `applicationDeadlineIso` (line 11):

```js
  // RSVP window for admitted applicants. Enforced by the rsvp action in
  // supabase/functions/submit-application/rsvp.ts, whose RSVP_DEADLINE is
  // pinned to this value by portalConfig.test.js. Anyone admitted after this
  // gets 24 hours from their decision instead; the server computes that and
  // hands the page an rsvp_deadline, so nothing here does date math.
  rsvpDeadlineIso: '2026-09-10T23:59:00-04:00',
  // Stamped onto each RSVP row so the record says which wording was accepted.
  // Bump together with rsvp.ts WAIVER_VERSION and participantWaiver.version.
  waiverVersion: '2026-09-08',
  minimumAge: 18,
```

After the `statuses` object (before `policyLinks`):

```js
  // Second axis on an admitted application. checked_in is not a stored status
  // -- it is attending plus a checked_in_at -- but it is what the console and
  // the ticket need to show, so it gets a badge like the rest.
  rsvpStatuses: {
    pending: {
      label: 'RSVP Pending',
      tone: 'text-outline border-white/10 bg-white/5',
    },
    attending: {
      label: 'Attending',
      tone: 'text-emerald-300 border-emerald-400/30 bg-emerald-400/10',
    },
    declined: {
      label: 'Declined',
      tone: 'text-rose-300 border-rose-400/30 bg-rose-400/10',
    },
    checked_in: {
      label: 'Checked In',
      tone: 'text-primary border-primary/30 bg-primary/10',
    },
  },
```

In `policyLinks` add `waiver: '/waiver',`.

At the end of the file:

```js
export function rsvpBadgeKey(application = {}) {
  if (application.checked_in_at) return 'checked_in';
  return application.rsvp_status || 'pending';
}

export function formatRsvpDeadline(iso = portalConfig.rsvpDeadlineIso) {
  return new Intl.DateTimeFormat('en-CA', {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: 'America/Toronto',
  }).format(new Date(iso));
}
```

- [ ] **Step 4: Add the waiver document to `legalContent.js`**

Before `export const legalDocuments`:

```js
/**
 * The participant waiver an admitted applicant accepts when they RSVP.
 *
 * `placeholder` is a real switch, not a note: while it is true the status page
 * shows "RSVP opens shortly" instead of the form (src/admissions/statusView.js),
 * which is the code-level form of the rule that no decision email goes out
 * before the waiver is live. Flip it to false in its own commit, together with
 * the final wording, and bump `version` in all three places if the wording
 * changes again after anyone has accepted it.
 */
export const participantWaiver = {
  slug: 'waiver',
  title: 'Participant Waiver',
  updated: portalConfig.waiverVersion,
  version: portalConfig.waiverVersion,
  placeholder: true,
  intro: [
    `PLACEHOLDER. The participant waiver for ${portalConfig.eventName} ${portalConfig.eventYear} (${portalConfig.eventDateRange}) is being finalised. The text below is a structural draft and is not the agreement you will be asked to accept.`,
    `Questions about the waiver can be sent to ${portalConfig.contactEmail}.`,
  ],
  sections: [
    {
      heading: 'Eligibility',
      paragraphs: [
        `PLACEHOLDER. Participation is open to admitted applicants aged ${portalConfig.minimumAge} or over.`,
      ],
    },
    { heading: 'Assumption of risk', paragraphs: ['PLACEHOLDER.'] },
    { heading: 'Release and indemnity', paragraphs: ['PLACEHOLDER.'] },
    { heading: 'Code of conduct', paragraphs: ['PLACEHOLDER.'] },
    { heading: 'Photography and media', paragraphs: ['PLACEHOLDER.'] },
    { heading: 'Emergency contact', paragraphs: ['PLACEHOLDER.'] },
  ],
};
```

Change the last line to `export const legalDocuments = [privacyPolicy, termsOfService, participantWaiver];`.

- [ ] **Step 5: Add the route in `App.jsx`**

Change the import to `import { participantWaiver, privacyPolicy, termsOfService } from './legal/legalContent';` and add after the `/terms` route:

```jsx
          <Route path="/waiver" element={<LegalPage document={participantWaiver} />} />
```

- [ ] **Step 6: Run to verify pass**

Run: `npm test`
Expected: PASS. In particular `legal documents › both render their title and every section heading` now covers the waiver, and `routes every contact instruction to the configured address` still passes because the waiver only names `contactEmail`.

- [ ] **Step 7: Commit**

```bash
git add src/admissions/portalConfig.js src/admissions/portalConfig.test.js src/legal/legalContent.js src/legal/legalContent.test.jsx src/App.jsx
git commit -m "Add RSVP deadline, waiver version and placeholder waiver page"
```

---

### Task 5: Client RSVP logic — validation, service call, status view

**Files:**
- Create: `src/admissions/rsvpValidation.js`, `src/admissions/rsvpValidation.test.js`
- Create: `src/admissions/statusView.js`, `src/admissions/statusView.test.js`
- Modify: `src/admissions/applicationService.js` (after `fetchApplicationStatus`)

**Interfaces:**
- Consumes: `participantWaiver.placeholder` (Task 4); server shapes from Task 3.
- Produces:
  - `emptyRsvpForm`, `validateRsvp(form) → errors` (keys `attending`, `emergency_contact_name`, `emergency_contact_phone`, `dietary_restrictions`, `waiver_accepted`)
  - `submitRsvp(statusToken, form) → application` (throws `ApplicationError`; `.message` is one of `'rsvp closed' | 'already responded' | 'underage' | 'not admitted' | 'not found' | 'Please fix the highlighted fields.'`, the last with `.fieldErrors`)
  - `deriveStatusView(application, now?, waiverReady?) → 'plain' | 'underage' | 'rsvp-waiting' | 'rsvp-open' | 'rsvp-closed' | 'declined' | 'attending' | 'checked-in'`
  - `RSVP_ERROR_COPY` map from server error code to sentence

- [ ] **Step 1: Write the failing validation tests**

```js
import { describe, it, expect } from 'vitest';
import { emptyRsvpForm, validateRsvp } from './rsvpValidation';

const attending = (overrides = {}) => ({
  ...emptyRsvpForm,
  attending: true,
  emergency_contact_name: 'Byron Lovelace',
  emergency_contact_phone: '647 555 0100',
  waiver_accepted: true,
  ...overrides,
});

describe('validateRsvp (client)', () => {
  it('starts undecided, so the applicant has to pick yes or no', () => {
    expect(emptyRsvpForm.attending).toBeNull();
    expect(validateRsvp(emptyRsvpForm).attending).toBeTruthy();
  });

  it('accepts a complete yes', () => {
    expect(validateRsvp(attending())).toEqual({});
  });

  it('accepts a bare no', () => {
    expect(validateRsvp({ ...emptyRsvpForm, attending: false })).toEqual({});
  });

  it('requires contact and waiver for a yes', () => {
    const errors = validateRsvp({ ...emptyRsvpForm, attending: true });
    expect(Object.keys(errors).sort()).toEqual([
      'emergency_contact_name',
      'emergency_contact_phone',
      'waiver_accepted',
    ]);
  });

  it('mirrors the server phone and length rules', () => {
    expect(validateRsvp(attending({ emergency_contact_phone: '12345' })).emergency_contact_phone).toBeTruthy();
    expect(validateRsvp(attending({ dietary_restrictions: 'x'.repeat(501) })).dietary_restrictions).toBeTruthy();
    expect(validateRsvp(attending({ emergency_contact_name: 'x'.repeat(201) })).emergency_contact_name).toBeTruthy();
  });
});
```

- [ ] **Step 2: Write `rsvpValidation.js`**

```js
// Client copy of the rules in supabase/functions/submit-application/rsvp.ts.
// Same keys, same limits: the server re-runs every one of these and its field
// errors land on this form, so the two have to agree on names.

export const emptyRsvpForm = {
  attending: null,
  dietary_restrictions: '',
  emergency_contact_name: '',
  emergency_contact_phone: '',
  waiver_accepted: false,
  roster_opt_in: false,
};

export const RSVP_LIMITS = {
  dietary_restrictions: 500,
  emergency_contact_name: 200,
  emergency_contact_phone: 50,
  minPhoneDigits: 7,
};

const text = (value) => (typeof value === 'string' ? value.trim() : '');

export function validateRsvp(form) {
  const errors = {};

  if (typeof form.attending !== 'boolean') {
    errors.attending = 'Tell us whether you are attending.';
  }
  if (form.attending !== true) return errors;

  const name = text(form.emergency_contact_name);
  if (!name) errors.emergency_contact_name = 'This field is required.';
  else if (name.length > RSVP_LIMITS.emergency_contact_name) {
    errors.emergency_contact_name = `Must be ${RSVP_LIMITS.emergency_contact_name} characters or fewer.`;
  }

  const phone = text(form.emergency_contact_phone);
  const digits = phone.replace(/\D/g, '').length;
  if (!phone) errors.emergency_contact_phone = 'This field is required.';
  else if (phone.length > RSVP_LIMITS.emergency_contact_phone) {
    errors.emergency_contact_phone = `Must be ${RSVP_LIMITS.emergency_contact_phone} characters or fewer.`;
  } else if (digits < RSVP_LIMITS.minPhoneDigits) {
    errors.emergency_contact_phone = 'Enter a phone number with at least 7 digits.';
  }

  if (text(form.dietary_restrictions).length > RSVP_LIMITS.dietary_restrictions) {
    errors.dietary_restrictions = `Must be ${RSVP_LIMITS.dietary_restrictions} characters or fewer.`;
  }

  if (form.waiver_accepted !== true) {
    errors.waiver_accepted = 'You must accept the waiver to attend.';
  }

  return errors;
}
```

- [ ] **Step 3: Write the failing status-view tests**

```js
import { describe, it, expect } from 'vitest';
import { deriveStatusView } from './statusView';

const DEADLINE = '2026-09-11T03:59:00.000Z';
const before = new Date('2026-09-09T12:00:00Z');
const after = new Date('2026-09-11T12:00:00Z');

const admitted = (overrides = {}) => ({
  status: 'admitted',
  over_18: true,
  rsvp_status: 'pending',
  checked_in_at: null,
  rsvp_deadline: DEADLINE,
  ...overrides,
});

describe('deriveStatusView', () => {
  it('is plain for anything not admitted, and for a missing application', () => {
    expect(deriveStatusView(null)).toBe('plain');
    for (const status of ['incomplete', 'submitted', 'waitlisted', 'rejected']) {
      expect(deriveStatusView(admitted({ status }), before, true)).toBe('plain');
    }
  });

  it('opens the form for an admitted adult before their deadline', () => {
    expect(deriveStatusView(admitted(), before, true)).toBe('rsvp-open');
  });

  // The waiver gate. Nothing about the applicant changed; the site is not
  // ready to take their acceptance yet.
  it('holds the form while the waiver is still a placeholder', () => {
    expect(deriveStatusView(admitted(), before, false)).toBe('rsvp-waiting');
  });

  it('closes after the deadline the server handed back', () => {
    expect(deriveStatusView(admitted(), after, true)).toBe('rsvp-closed');
  });

  it('turns under-18s away before looking at the deadline', () => {
    expect(deriveStatusView(admitted({ over_18: false }), after, true)).toBe('underage');
  });

  it('shows the answer once one is given, regardless of deadline', () => {
    expect(deriveStatusView(admitted({ rsvp_status: 'declined' }), after, true)).toBe('declined');
    expect(deriveStatusView(admitted({ rsvp_status: 'attending' }), after, true)).toBe('attending');
  });

  it('shows checked-in over attending', () => {
    expect(
      deriveStatusView(admitted({ rsvp_status: 'attending', checked_in_at: '2026-09-12T13:00:00Z' }), after, true),
    ).toBe('checked-in');
  });

  it('reads the waiver flag by default', () => {
    // participantWaiver.placeholder is true in this plan; the default must
    // therefore hold the form rather than open it.
    expect(deriveStatusView(admitted(), before)).toBe('rsvp-waiting');
  });
});
```

- [ ] **Step 4: Write `statusView.js`**

```js
import { participantWaiver } from '../legal/legalContent';

/**
 * Which panel the status page shows. One function so the ordering is in one
 * place: an answer already given beats every other consideration, age beats
 * deadline (an under-18 is told why, not "closed"), and the waiver gate only
 * matters once the form would otherwise open.
 */
export function deriveStatusView(
  application,
  now = new Date(),
  waiverReady = !participantWaiver.placeholder,
) {
  if (!application || application.status !== 'admitted') return 'plain';
  if (application.checked_in_at) return 'checked-in';
  if (application.rsvp_status === 'attending') return 'attending';
  if (application.rsvp_status === 'declined') return 'declined';
  if (application.over_18 !== true) return 'underage';
  if (application.rsvp_deadline && now > new Date(application.rsvp_deadline)) {
    return 'rsvp-closed';
  }
  if (!waiverReady) return 'rsvp-waiting';
  return 'rsvp-open';
}

/** Server error codes from the rsvp action, as sentences. */
export const RSVP_ERROR_COPY = {
  'rsvp closed': 'RSVPs have closed. If you think this is a mistake, email us.',
  'already responded': 'We already have your RSVP. Reload this page to see it.',
  underage: 'The event is 18+, so we cannot take an RSVP for this application.',
  'not admitted': 'This application has not been admitted.',
  'not found': 'That link does not match an application.',
};
```

- [ ] **Step 5: Add `submitRsvp` to `applicationService.js`** (after `fetchApplicationStatus`)

```js
/**
 * An admitted applicant's one-shot RSVP. Resolves to the same shape `status`
 * returns, already reflecting the answer. Throws ApplicationError: a
 * `validation failed` reply carries fieldErrors keyed like the form; the other
 * codes ('rsvp closed', 'already responded', 'underage', 'not admitted',
 * 'not found') arrive as the message, which statusView.RSVP_ERROR_COPY maps
 * to a sentence.
 */
export async function submitRsvp(statusToken, form) {
  const { application } = await callSubmitFunction({
    action: 'rsvp',
    statusToken,
    attending: form.attending === true,
    dietaryRestrictions: form.dietary_restrictions,
    emergencyContactName: form.emergency_contact_name,
    emergencyContactPhone: form.emergency_contact_phone,
    waiverAccepted: form.waiver_accepted === true,
    rosterOptIn: form.roster_opt_in === true,
  });
  return application;
}
```

- [ ] **Step 6: Run to verify pass**

Run: `npx vitest run src/admissions/rsvpValidation.test.js src/admissions/statusView.test.js`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/admissions/rsvpValidation.js src/admissions/rsvpValidation.test.js src/admissions/statusView.js src/admissions/statusView.test.js src/admissions/applicationService.js
git commit -m "Add client RSVP validation, service call and status view logic"
```

---

### Task 6: RSVP form, ticket card, and the status page states

**Files:**
- Modify: `package.json` (add `qrcode`)
- Create: `src/admissions/RsvpForm.jsx`, `src/admissions/TicketCard.jsx`, `src/admissions/RsvpBadge.jsx`
- Modify: `src/pages/ApplicationStatusPage.jsx` (rewrite the `!loading && application` branch and the subtitle)
- Create: `src/pages/ApplicationStatusPage.test.jsx`

**Interfaces:**
- Consumes: `deriveStatusView`, `RSVP_ERROR_COPY` (Task 5); `submitRsvp`, `fetchApplicationStatus`; `emptyRsvpForm`, `validateRsvp`; `portalConfig.rsvpStatuses`, `rsvpBadgeKey`, `formatRsvpDeadline`, `policyLinks.waiver` (Task 4).
- Produces: `<RsvpForm application onSubmit />` where `onSubmit(form)` returns a promise; `<TicketCard application statusUrl />`; `<RsvpBadge application />`. Task 10 reuses `RsvpBadge`.

- [ ] **Step 1: Install the QR renderer**

Run: `npm install qrcode@1.5.4`
Expected: `package.json` gains `"qrcode": "^1.5.4"` under dependencies.

- [ ] **Step 2: Write the failing page tests**

```jsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import ApplicationStatusPage from './ApplicationStatusPage';

// jsdom has no canvas; the QR renderer is a black box here.
vi.mock('qrcode', () => ({
  default: { toCanvas: vi.fn(() => Promise.resolve()) },
}));

vi.mock('../admissions/supabaseClient', () => ({
  isSupabaseConfigured: true,
  supabase: {},
  requireSupabase: vi.fn(),
}));

const fetchApplicationStatus = vi.fn();
const submitRsvp = vi.fn();
vi.mock('../admissions/applicationService', () => ({
  fetchApplicationStatus: (...args) => fetchApplicationStatus(...args),
  submitRsvp: (...args) => submitRsvp(...args),
}));

// The waiver is a placeholder in the repo; these tests exercise the form as
// it will behave once the real text lands, plus one test of the gate itself.
let waiverPlaceholder = false;
vi.mock('../legal/legalContent', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    get participantWaiver() {
      return { ...actual.participantWaiver, placeholder: waiverPlaceholder };
    },
  };
});

const TOKEN = '11111111-1111-1111-1111-111111111111';
const FUTURE = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();
const PAST = new Date(Date.now() - 60 * 60 * 1000).toISOString();

const admitted = (overrides = {}) => ({
  status: 'admitted',
  submitted_at: '2026-09-01T12:00:00Z',
  first_name: 'Ada',
  school: 'University of Waterloo',
  preferred_track: 'Robotics',
  over_18: true,
  rsvp_status: 'pending',
  rsvp_at: null,
  dietary_restrictions: null,
  emergency_contact_name: null,
  emergency_contact_phone: null,
  roster_opt_in: false,
  checked_in_at: null,
  rsvp_deadline: FUTURE,
  ...overrides,
});

const setup = () =>
  render(
    <MemoryRouter initialEntries={[`/apply/status/${TOKEN}`]}>
      <Routes>
        <Route path="/apply/status/:token" element={<ApplicationStatusPage />} />
      </Routes>
    </MemoryRouter>,
  );

beforeEach(() => {
  fetchApplicationStatus.mockReset();
  submitRsvp.mockReset();
  waiverPlaceholder = false;
});

describe('status page before a decision', () => {
  it('shows the badge and no RSVP controls', async () => {
    fetchApplicationStatus.mockResolvedValue(admitted({ status: 'submitted', rsvp_deadline: null }));
    setup();
    expect(await screen.findByText('Submitted')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^yes/i })).toBeNull();
  });
});

describe('admitted, RSVP open', () => {
  it('renders the form with the deadline', async () => {
    fetchApplicationStatus.mockResolvedValue(admitted());
    setup();
    expect(await screen.findByText('Admitted')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^yes/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^no/i })).toBeInTheDocument();
    expect(screen.getByText(/rsvp by/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /participant waiver/i })).toHaveAttribute('href', '/waiver');
  });

  it('hides the details when the answer is no, and submits a decline', async () => {
    const user = userEvent.setup();
    fetchApplicationStatus.mockResolvedValue(admitted());
    submitRsvp.mockResolvedValue(admitted({ rsvp_status: 'declined', rsvp_at: PAST }));
    setup();
    await user.click(await screen.findByRole('button', { name: /^no/i }));
    expect(screen.queryByLabelText(/emergency contact name/i)).toBeNull();
    await user.click(screen.getByRole('button', { name: /send rsvp/i }));
    await waitFor(() => expect(submitRsvp).toHaveBeenCalledTimes(1));
    expect(submitRsvp.mock.calls[0][0]).toBe(TOKEN);
    expect(submitRsvp.mock.calls[0][1].attending).toBe(false);
    expect(await screen.findByText(/sorry you can.t make it/i)).toBeInTheDocument();
  });

  it('will not send a yes without the waiver and a contact', async () => {
    const user = userEvent.setup();
    fetchApplicationStatus.mockResolvedValue(admitted());
    setup();
    await user.click(await screen.findByRole('button', { name: /^yes/i }));
    await user.click(screen.getByRole('button', { name: /send rsvp/i }));
    expect(submitRsvp).not.toHaveBeenCalled();
    expect(await screen.findByText(/accept the waiver/i)).toBeInTheDocument();
  });

  it('sends a complete yes and shows the ticket', async () => {
    const user = userEvent.setup();
    fetchApplicationStatus.mockResolvedValue(admitted());
    submitRsvp.mockResolvedValue(
      admitted({
        rsvp_status: 'attending',
        rsvp_at: PAST,
        emergency_contact_name: 'Byron',
        emergency_contact_phone: '6475550100',
      }),
    );
    setup();
    await user.click(await screen.findByRole('button', { name: /^yes/i }));
    await user.type(screen.getByLabelText(/emergency contact name/i), 'Byron');
    await user.type(screen.getByLabelText(/emergency contact phone/i), '647 555 0100');
    await user.click(screen.getByLabelText(/i have read and agree/i));
    await user.click(screen.getByLabelText(/show my first name/i));
    await user.click(screen.getByRole('button', { name: /send rsvp/i }));

    await waitFor(() => expect(submitRsvp).toHaveBeenCalledTimes(1));
    const form = submitRsvp.mock.calls[0][1];
    expect(form).toMatchObject({
      attending: true,
      emergency_contact_name: 'Byron',
      waiver_accepted: true,
      roster_opt_in: true,
    });
    expect(await screen.findByText(/show this at the door/i)).toBeInTheDocument();
    expect(screen.getByText('Attending')).toBeInTheDocument();
  });

  it('puts a server field rejection back on the field', async () => {
    const user = userEvent.setup();
    fetchApplicationStatus.mockResolvedValue(admitted());
    const error = new Error('Please fix the highlighted fields.');
    error.fieldErrors = { emergency_contact_phone: 'Enter a phone number with at least 7 digits.' };
    submitRsvp.mockRejectedValue(error);
    setup();
    await user.click(await screen.findByRole('button', { name: /^yes/i }));
    await user.type(screen.getByLabelText(/emergency contact name/i), 'Byron');
    await user.type(screen.getByLabelText(/emergency contact phone/i), '647 555 0100');
    await user.click(screen.getByLabelText(/i have read and agree/i));
    await user.click(screen.getByRole('button', { name: /send rsvp/i }));
    expect(await screen.findByText(/at least 7 digits/i)).toBeInTheDocument();
  });

  it('explains a closed window returned by the server', async () => {
    const user = userEvent.setup();
    fetchApplicationStatus.mockResolvedValue(admitted());
    submitRsvp.mockRejectedValue(new Error('rsvp closed'));
    setup();
    await user.click(await screen.findByRole('button', { name: /^no/i }));
    await user.click(screen.getByRole('button', { name: /send rsvp/i }));
    expect(await screen.findByText(/rsvps have closed/i)).toBeInTheDocument();
  });
});

describe('admitted, other states', () => {
  it('holds the form while the waiver is a placeholder', async () => {
    waiverPlaceholder = true;
    fetchApplicationStatus.mockResolvedValue(admitted());
    setup();
    expect(await screen.findByText(/rsvp opens shortly/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^yes/i })).toBeNull();
  });

  it('turns an under-18 away with the contact address', async () => {
    fetchApplicationStatus.mockResolvedValue(admitted({ over_18: false }));
    setup();
    expect(await screen.findByText(/18\+/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^yes/i })).toBeNull();
  });

  it('says RSVPs closed once the deadline has passed', async () => {
    fetchApplicationStatus.mockResolvedValue(admitted({ rsvp_deadline: PAST }));
    setup();
    expect(await screen.findByText(/rsvps closed/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^yes/i })).toBeNull();
  });

  it('shows the ticket to someone attending, and marks it once checked in', async () => {
    fetchApplicationStatus.mockResolvedValue(
      admitted({ rsvp_status: 'attending', rsvp_at: PAST, checked_in_at: '2026-09-12T13:05:00Z' }),
    );
    setup();
    expect(await screen.findByText('Checked In')).toBeInTheDocument();
    expect(screen.getByText(/show this at the door/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `npx vitest run src/pages/ApplicationStatusPage.test.jsx`
Expected: FAIL (no RSVP controls rendered yet).

- [ ] **Step 4: Write `RsvpBadge.jsx`**

```jsx
import { portalConfig, rsvpBadgeKey } from './portalConfig';

export default function RsvpBadge({ application }) {
  const meta = portalConfig.rsvpStatuses[rsvpBadgeKey(application)];
  return (
    <span
      className={`inline-flex items-center rounded-full border px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-widest ${meta.tone}`}
    >
      {meta.label}
    </span>
  );
}
```

- [ ] **Step 5: Write `RsvpForm.jsx`**

```jsx
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { formatRsvpDeadline, portalConfig } from './portalConfig';
import { emptyRsvpForm, validateRsvp } from './rsvpValidation';
import { RSVP_ERROR_COPY } from './statusView';

const inputClass =
  'w-full rounded-xl border border-primary/10 bg-surface-container-lowest/90 px-4 py-3 text-sm text-white outline-none placeholder:text-outline focus:border-primary/50';

function Field({ id, label, error, children }) {
  return (
    <label className="block" htmlFor={id}>
      <span className="mb-2 block font-mono text-[10px] font-bold uppercase tracking-widest text-outline">
        {label}
      </span>
      {children}
      {error && <span className="mt-2 block text-xs text-rose-300">{error}</span>}
    </label>
  );
}

/**
 * One shot, like the application itself. `onSubmit(form)` is expected to
 * reject with an ApplicationError: fieldErrors land on the fields, anything
 * else is mapped through RSVP_ERROR_COPY or shown as-is.
 */
export default function RsvpForm({ application, onSubmit }) {
  const [form, setForm] = useState(emptyRsvpForm);
  const [errors, setErrors] = useState({});
  const [banner, setBanner] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const set = (field) => (event) => {
    const value =
      event.target.type === 'checkbox' ? event.target.checked : event.target.value;
    setForm((current) => ({ ...current, [field]: value }));
  };

  const choose = (attending) => () => {
    setForm((current) => ({ ...current, attending }));
    setErrors({});
    setBanner('');
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const found = validateRsvp(form);
    setErrors(found);
    setBanner('');
    if (Object.keys(found).length > 0) return;

    setSubmitting(true);
    try {
      await onSubmit(form);
    } catch (error) {
      if (error?.fieldErrors && Object.keys(error.fieldErrors).length > 0) {
        setErrors(error.fieldErrors);
        setBanner(error.message);
      } else {
        setBanner(RSVP_ERROR_COPY[error?.message] || error?.message || 'Something went wrong.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const choiceClass = (active) =>
    `rounded-full border px-6 py-3 font-mono text-[10px] font-bold uppercase tracking-widest transition-colors ${
      active
        ? 'border-primary bg-primary/20 text-white'
        : 'border-white/10 bg-white/5 text-on-surface-variant hover:text-white'
    }`;

  return (
    <form className="mt-8 space-y-6" noValidate onSubmit={handleSubmit}>
      <div>
        <div className="font-mono text-[10px] font-bold uppercase tracking-widest text-outline">
          RSVP by {formatRsvpDeadline(application.rsvp_deadline)}
        </div>
        <p className="mt-2 text-sm leading-relaxed text-on-surface-variant">
          Are you attending {portalConfig.eventName} on {portalConfig.eventDateRange}?
          You can answer once, so make it the real answer.
        </p>
        <div className="mt-4 flex gap-3">
          <button
            aria-pressed={form.attending === true}
            className={choiceClass(form.attending === true)}
            onClick={choose(true)}
            type="button"
          >
            Yes, I&apos;m coming
          </button>
          <button
            aria-pressed={form.attending === false}
            className={choiceClass(form.attending === false)}
            onClick={choose(false)}
            type="button"
          >
            No, I can&apos;t
          </button>
        </div>
        {errors.attending && (
          <p className="mt-2 text-xs text-rose-300">{errors.attending}</p>
        )}
      </div>

      {form.attending === true && (
        <div className="space-y-5 border-t border-white/10 pt-6">
          <Field id="rsvp-dietary" label="Dietary restrictions (optional)" error={errors.dietary_restrictions}>
            <input
              className={inputClass}
              id="rsvp-dietary"
              onChange={set('dietary_restrictions')}
              placeholder="Vegetarian, halal, nut allergy..."
              value={form.dietary_restrictions}
            />
          </Field>

          <Field id="rsvp-contact-name" label="Emergency contact name" error={errors.emergency_contact_name}>
            <input
              className={inputClass}
              id="rsvp-contact-name"
              onChange={set('emergency_contact_name')}
              value={form.emergency_contact_name}
            />
          </Field>

          <Field id="rsvp-contact-phone" label="Emergency contact phone" error={errors.emergency_contact_phone}>
            <input
              className={inputClass}
              id="rsvp-contact-phone"
              inputMode="tel"
              onChange={set('emergency_contact_phone')}
              value={form.emergency_contact_phone}
            />
          </Field>

          <label className="flex items-start gap-3 text-sm text-on-surface-variant">
            <input
              checked={form.waiver_accepted}
              className="mt-1"
              onChange={set('waiver_accepted')}
              type="checkbox"
            />
            <span>
              I have read and agree to the{' '}
              <Link className="text-primary hover:underline" target="_blank" to={portalConfig.policyLinks.waiver}>
                Participant Waiver
              </Link>
              .
            </span>
          </label>
          {errors.waiver_accepted && (
            <p className="-mt-3 text-xs text-rose-300">{errors.waiver_accepted}</p>
          )}

          <label className="flex items-start gap-3 text-sm text-on-surface-variant">
            <input
              checked={form.roster_opt_in}
              className="mt-1"
              onChange={set('roster_opt_in')}
              type="checkbox"
            />
            <span>
              Show my first name, last initial, and school on the public participants list.
            </span>
          </label>
        </div>
      )}

      {banner && (
        <div className="rounded-2xl border border-rose-400/20 bg-rose-950/20 p-4 text-sm text-rose-100">
          {banner}
        </div>
      )}

      {form.attending !== null && (
        <button
          className="w-full rounded-full bg-gradient-to-r from-cyber-blue to-primary-container px-6 py-3 font-mono text-[10px] font-bold uppercase tracking-widest text-white shadow-glow-blue disabled:cursor-not-allowed disabled:opacity-60"
          disabled={submitting}
          type="submit"
        >
          {submitting ? 'Sending...' : 'Send RSVP'}
        </button>
      )}
    </form>
  );
}
```

- [ ] **Step 6: Write `TicketCard.jsx`**

```jsx
import { useEffect, useRef } from 'react';
import QRCode from 'qrcode';
import RsvpBadge from './RsvpBadge';

function formatTime(value) {
  return new Intl.DateTimeFormat('en-CA', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'America/Toronto',
  }).format(new Date(value));
}

/**
 * The thing shown at the door. The QR encodes the status URL, which is the
 * bookmark the applicant already holds -- so it discloses nothing new, and a
 * phone camera outside the scan page still lands somewhere sensible.
 */
export default function TicketCard({ application, statusUrl }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    QRCode.toCanvas(canvasRef.current, statusUrl, {
      width: 240,
      margin: 1,
      color: { dark: '#0c0e17', light: '#ffffff' },
    }).catch(() => {
      // Nothing to do: the text fallback below is always rendered.
    });
  }, [statusUrl]);

  return (
    <div className="mt-8 rounded-3xl border border-emerald-400/20 bg-emerald-950/10 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="font-mono text-[10px] font-bold uppercase tracking-widest text-outline">
            Your ticket
          </div>
          <div className="mt-2 font-display text-2xl font-black uppercase text-white">
            {application.first_name}
          </div>
          <div className="mt-1 text-sm text-on-surface-variant">
            {application.school} · {application.preferred_track}
          </div>
        </div>
        <RsvpBadge application={application} />
      </div>

      <div className="mt-6 flex flex-col items-center gap-4 sm:flex-row sm:items-start">
        <div className="rounded-2xl bg-white p-3">
          <canvas aria-label="Your check-in QR code" ref={canvasRef} />
        </div>
        <div className="text-sm leading-relaxed text-on-surface-variant">
          <p className="text-white">Show this at the door.</p>
          <p className="mt-2">
            Screenshot it now in case you lose the link. Anyone at the desk can
            also find you by name.
          </p>
          {application.checked_in_at && (
            <p className="mt-2 text-emerald-300">
              Checked in {formatTime(application.checked_in_at)}.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Rewrite the found-application branch of `ApplicationStatusPage.jsx`**

Add imports:

```jsx
import RsvpForm from '../admissions/RsvpForm';
import TicketCard from '../admissions/TicketCard';
import { fetchApplicationStatus, submitRsvp } from '../admissions/applicationService';
import { formatRsvpDeadline } from '../admissions/portalConfig';
import { deriveStatusView } from '../admissions/statusView';
```

Inside the component, after `const { loading, application, error } = state;`:

```jsx
  const view = deriveStatusView(application);
  const statusUrl = `${window.location.origin}/apply/status/${token}`;

  const handleRsvp = async (form) => {
    const updated = await submitRsvp(token, form);
    setState({ loading: false, application: updated, error: '' });
  };

  const subtitle =
    view === 'plain'
      ? 'We will email your decision before the event. This page shows where things stand until then.'
      : 'You are in. This page is your RSVP and, once you have RSVP’d, your ticket.';
```

Pass `subtitle={subtitle}` to `PortalShell`. Then replace the `<p className="mt-8 ...">Decisions go out ...</p>` at the bottom of the application panel with:

```jsx
          {view === 'plain' && (
            <p className="mt-8 text-sm leading-relaxed text-on-surface-variant">
              Decisions go out before the event on {portalConfig.eventDateRange}.
              Check back here, this page always shows the current state, whether
              or not our email reaches you.
            </p>
          )}

          {view === 'rsvp-waiting' && (
            <div className="mt-8 rounded-2xl border border-primary/20 bg-primary/5 p-5 text-sm leading-relaxed text-on-surface-variant">
              RSVP opens shortly. Come back to this link; we will also email you when it does.
            </div>
          )}

          {view === 'rsvp-open' && (
            <RsvpForm application={application} onSubmit={handleRsvp} />
          )}

          {view === 'rsvp-closed' && (
            <div className="mt-8 rounded-2xl border border-rose-400/20 bg-rose-950/20 p-5 text-sm leading-relaxed text-rose-100">
              RSVPs closed on {formatRsvpDeadline(application.rsvp_deadline)} and
              this spot has been released. If something went wrong, email{' '}
              <a className="underline" href={`mailto:${portalConfig.contactEmail}`}>
                {portalConfig.contactEmail}
              </a>
              .
            </div>
          )}

          {view === 'underage' && (
            <div className="mt-8 rounded-2xl border border-secondary-fixed/20 bg-secondary-fixed/5 p-5 text-sm leading-relaxed text-on-surface-variant">
              The event is 18+, and this application says you are under 18. If
              that is wrong, email{' '}
              <a className="text-primary hover:underline" href={`mailto:${portalConfig.contactEmail}`}>
                {portalConfig.contactEmail}
              </a>{' '}
              from the address you applied with.
            </div>
          )}

          {view === 'declined' && (
            <div className="mt-8 rounded-2xl border border-white/10 bg-white/5 p-5 text-sm leading-relaxed text-on-surface-variant">
              Sorry you can&apos;t make it. Thanks for letting us know; your spot
              has gone to someone on the waitlist.
            </div>
          )}

          {(view === 'attending' || view === 'checked-in') && (
            <>
              <TicketCard application={application} statusUrl={statusUrl} />
              <dl className="mt-6 grid gap-4 text-sm sm:grid-cols-2">
                <div>
                  <dt className="font-mono text-[10px] font-bold uppercase tracking-widest text-outline">Emergency contact</dt>
                  <dd className="mt-1 text-white">
                    {application.emergency_contact_name} · {application.emergency_contact_phone}
                  </dd>
                </div>
                <div>
                  <dt className="font-mono text-[10px] font-bold uppercase tracking-widest text-outline">Dietary</dt>
                  <dd className="mt-1 text-white">{application.dietary_restrictions || 'None given'}</dd>
                </div>
              </dl>
            </>
          )}
```

Update the header comment's "five columns" sentence to say the endpoint returns the status columns plus RSVP state and nothing else.

- [ ] **Step 8: Run to verify pass, then lint and build**

Run: `npx vitest run src/pages/ApplicationStatusPage.test.jsx && npm test && npm run lint && npm run build`
Expected: all PASS; build succeeds (confirms `qrcode` resolves under Vite).

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json src/admissions/RsvpForm.jsx src/admissions/TicketCard.jsx src/admissions/RsvpBadge.jsx src/pages/ApplicationStatusPage.jsx src/pages/ApplicationStatusPage.test.jsx
git commit -m "Add RSVP form and QR ticket to the status page"
```

---

### Task 7: CSV exports module and the admitted export (mail-merge unblocker)

**Files:**
- Create: `src/admissions/admin/exports.js`, `src/admissions/admin/exports.test.js`
- Modify: `src/pages/AdmissionsAdminPage.jsx:56-96` (delete the local CSV helpers), `:438-445` (export buttons)

**Interfaces:**
- Produces: `csvEscape(value)`, `toCsv(headers, rows)`, `buildApplicationsCsv(applications)`, `buildAdmittedCsv(applications, origin)`, `buildAttendingCsv(applications)`, `downloadCsv(filename, csv)`. Task 10 adds the attending button.

- [ ] **Step 1: Write the failing tests**

```js
import { describe, it, expect } from 'vitest';
import {
  buildAdmittedCsv,
  buildApplicationsCsv,
  buildAttendingCsv,
  csvEscape,
  toCsv,
} from './exports';

const app = (overrides = {}) => ({
  id: 'a1',
  email: 'ada@uwaterloo.ca',
  status: 'admitted',
  first_name: 'Ada',
  last_name: 'Lovelace',
  school: 'University of Waterloo',
  program: 'CS',
  preferred_track: 'Robotics',
  submitted_at: '2026-09-01T12:00:00Z',
  admin_notes: '',
  status_token: '11111111-1111-1111-1111-111111111111',
  rsvp_status: 'pending',
  dietary_restrictions: null,
  emergency_contact_name: null,
  emergency_contact_phone: null,
  checked_in_at: null,
  ...overrides,
});

describe('csvEscape', () => {
  it('quotes and doubles quotes', () => {
    expect(csvEscape('a "b"')).toBe('"a ""b"""');
  });

  // A leading =, +, -, @ runs as a formula in Excel/Sheets.
  it('neutralises formula prefixes', () => {
    expect(csvEscape('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvEscape('+1 647')).toBe(`"'+1 647"`);
  });

  it('renders null as empty', () => {
    expect(csvEscape(null)).toBe('""');
  });
});

describe('toCsv', () => {
  it('joins headers and rows with newlines', () => {
    expect(toCsv(['a', 'b'], [['1', '2']])).toBe('a,b\n"1","2"');
  });
});

describe('buildApplicationsCsv', () => {
  it('keeps the original column order', () => {
    const [header] = buildApplicationsCsv([app()]).split('\n');
    expect(header).toBe('email,status,first_name,last_name,school,program,preferred_track,submitted_at,admin_notes');
  });
});

describe('buildAdmittedCsv', () => {
  it('includes only admitted rows, with a full status URL for the mail merge', () => {
    const csv = buildAdmittedCsv(
      [app(), app({ id: 'a2', status: 'waitlisted', email: 'x@y.ca' })],
      'https://utwat.ca',
    );
    const lines = csv.split('\n');
    expect(lines[0]).toBe('first_name,last_name,email,school,status_url');
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain('"https://utwat.ca/apply/status/11111111-1111-1111-1111-111111111111"');
  });

  it('sorts by last name then first name', () => {
    const csv = buildAdmittedCsv(
      [app({ last_name: 'Zuse', first_name: 'Konrad' }), app({ id: 'b', email: 'b@b.ca', last_name: 'Babbage', first_name: 'Charles' })],
      'https://utwat.ca',
    );
    expect(csv.split('\n')[1]).toContain('Babbage');
  });
});

describe('buildAttendingCsv', () => {
  it('includes only attending rows with door and catering columns', () => {
    const csv = buildAttendingCsv([
      app({ rsvp_status: 'attending', dietary_restrictions: 'vegan', emergency_contact_name: 'B', emergency_contact_phone: '1', checked_in_at: null }),
      app({ id: 'a2', email: 'no@no.ca', rsvp_status: 'declined' }),
    ]);
    const lines = csv.split('\n');
    expect(lines[0]).toBe('last_name,first_name,email,school,preferred_track,dietary_restrictions,emergency_contact_name,emergency_contact_phone,checked_in_at');
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain('vegan');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/admissions/admin/exports.test.js`
Expected: FAIL, module not found.

- [ ] **Step 3: Write `exports.js`**

```js
// Every CSV the console produces. Moved out of AdmissionsAdminPage so the
// formula-injection guard has one home and each export can be tested as a
// string rather than by clicking a button.

export function csvEscape(value) {
  let text = value == null ? '' : String(value);
  // Neutralize spreadsheet formula injection: a leading =, +, -, @, tab, or CR
  // can execute when the export is opened in Excel/Sheets.
  if (/^[=+\-@\t\r]/.test(text)) {
    text = `'${text}`;
  }
  return `"${text.replaceAll('"', '""')}"`;
}

export function toCsv(headers, rows) {
  return [headers.join(','), ...rows.map((row) => row.map(csvEscape).join(','))].join('\n');
}

const byName = (a, b) =>
  (a.last_name || '').localeCompare(b.last_name || '') ||
  (a.first_name || '').localeCompare(b.first_name || '');

const pick = (headers) => (application) => headers.map((h) => application[h]);

const APPLICATION_HEADERS = [
  'email', 'status', 'first_name', 'last_name', 'school', 'program',
  'preferred_track', 'submitted_at', 'admin_notes',
];

/** The general export the console has always had; whatever is filtered in. */
export function buildApplicationsCsv(applications) {
  return toCsv(APPLICATION_HEADERS, applications.map(pick(APPLICATION_HEADERS)));
}

/**
 * Mail-merge input: one row per admitted applicant with their personal status
 * link. `origin` is window.location.origin at click time, so exporting from
 * production yields production links.
 */
export function buildAdmittedCsv(applications, origin) {
  const headers = ['first_name', 'last_name', 'email', 'school', 'status_url'];
  const rows = applications
    .filter((a) => a.status === 'admitted')
    .sort(byName)
    .map((a) => [
      a.first_name, a.last_name, a.email, a.school,
      `${origin}/apply/status/${a.status_token}`,
    ]);
  return toCsv(headers, rows);
}

/** The day-of sheet and, printed, the door clipboard. Sorted by last name. */
export function buildAttendingCsv(applications) {
  const headers = [
    'last_name', 'first_name', 'email', 'school', 'preferred_track',
    'dietary_restrictions', 'emergency_contact_name', 'emergency_contact_phone',
    'checked_in_at',
  ];
  const rows = applications
    .filter((a) => a.rsvp_status === 'attending')
    .sort(byName)
    .map(pick(headers));
  return toCsv(headers, rows);
}

export function downloadCsv(filename, csv) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
```

- [ ] **Step 4: Point the admin page at it**

In `AdmissionsAdminPage.jsx`: delete the local `csvEscape`, `buildCsv`, and `downloadCsv` (lines 56–96). Add:

```jsx
import {
  buildAdmittedCsv,
  buildApplicationsCsv,
  downloadCsv,
} from "../admissions/admin/exports";
```

Replace the existing Export button's `onClick` with `onClick={() => downloadCsv("bots-applications.csv", buildApplicationsCsv(filteredApplications))}` and add a second button right after it:

```jsx
              <button
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-400/30 bg-emerald-400/5 px-4 py-3 font-mono text-[10px] font-bold uppercase tracking-widest text-emerald-300 hover:bg-emerald-400/10"
                onClick={() =>
                  downloadCsv(
                    "bots-admitted-mail-merge.csv",
                    buildAdmittedCsv(applications, window.location.origin),
                  )
                }
                type="button"
              >
                <Download size={14} />
                Export Admitted
              </button>
```

Note it exports from `applications` (all rows), not `filteredApplications`, so a stray filter cannot drop admits from the mail merge. Widen the grid to `lg:grid-cols-[1fr_180px_240px_auto_auto_auto]`.

- [ ] **Step 5: Run to verify pass, lint, build**

Run: `npm test && npm run lint && npm run build`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/admissions/admin/exports.js src/admissions/admin/exports.test.js src/pages/AdmissionsAdminPage.jsx
git commit -m "Move CSV export out of the console page and add the admitted mail-merge export"
```

---

### Task 8: Admin function — check-in, reset, manual check-in, and the `decided_at` fix

**Files:**
- Create: `supabase/functions/admin-applications/checkin.ts`, `supabase/functions/admin-applications/checkin.test.js`
- Modify: `supabase/functions/admin-applications/index.ts:1` (import), `:176` (before the `list` action), `:209-253` (PATCH)

**Interfaces:**
- Produces:
  - `POST { action: 'checkin', statusToken }` and `POST { action: 'checkin_by_email', email }` → always 200 with `{ result: 'checked_in' | 'already_checked_in' | 'not_attending' | 'not_found', application: { first_name, last_name, school, checked_in_at } | null }`.
  - `PATCH { id, rsvp_reset: true }` → row back to pending with everything cleared.
  - `PATCH { id, checked_in: true | false }` → manual check-in / undo; 409 if not attending.
  - `PATCH { id, status }` now only stamps `decided_at`/`decided_by` when the status actually changes (a notes-only save no longer resets the decision time, which would otherwise extend a late admit's RSVP window every time an admin saved notes).
  - From `checkin.ts`: `extractStatusToken(raw)`, `checkinOutcome(row)`, `publicCheckinFields(row)`, `rsvpResetUpdate()`, `CHECKIN_COLUMNS`.

- [ ] **Step 1: Write the failing tests**

```js
import { describe, it, expect } from 'vitest'
import {
  CHECKIN_COLUMNS,
  checkinOutcome,
  extractStatusToken,
  publicCheckinFields,
  rsvpResetUpdate,
} from './checkin.ts'

const TOKEN = '11111111-1111-1111-1111-111111111111'

describe('extractStatusToken', () => {
  it('accepts a bare uuid, trimmed and lowercased', () => {
    expect(extractStatusToken(`  ${TOKEN.toUpperCase()} `)).toBe(TOKEN)
  })

  // The QR encodes the status URL, so this is the common case at the door.
  it('pulls the uuid out of a status URL', () => {
    expect(extractStatusToken(`https://utwat.ca/apply/status/${TOKEN}`)).toBe(TOKEN)
    expect(extractStatusToken(`https://utwat.ca/apply/status/${TOKEN}?utm=x`)).toBe(TOKEN)
  })

  it('returns null for anything else', () => {
    for (const v of ['', 'hello', 42, null, undefined, 'https://utwat.ca/']) {
      expect(extractStatusToken(v)).toBeNull()
    }
  })
})

describe('checkinOutcome', () => {
  const row = (o = {}) => ({ id: 'a', rsvp_status: 'attending', checked_in_at: null, ...o })

  it('maps the four cases the door needs', () => {
    expect(checkinOutcome(null)).toBe('not_found')
    expect(checkinOutcome(row({ rsvp_status: 'pending' }))).toBe('not_attending')
    expect(checkinOutcome(row({ rsvp_status: 'declined' }))).toBe('not_attending')
    expect(checkinOutcome(row({ checked_in_at: '2026-09-12T13:00:00Z' }))).toBe('already_checked_in')
    expect(checkinOutcome(row())).toBe('checked_in')
  })
})

describe('publicCheckinFields', () => {
  it('returns only what the scan screen shows', () => {
    const out = publicCheckinFields({
      id: 'a', email: 'x@y.ca', first_name: 'Ada', last_name: 'Lovelace',
      school: 'UW', rsvp_status: 'attending', checked_in_at: null, phone: '1',
    })
    expect(Object.keys(out).sort()).toEqual(['checked_in_at', 'first_name', 'last_name', 'school'])
  })
})

describe('rsvpResetUpdate', () => {
  it('clears every RSVP and check-in column, matching the trigger reset shape', () => {
    expect(rsvpResetUpdate()).toEqual({
      rsvp_status: 'pending',
      rsvp_at: null,
      dietary_restrictions: null,
      emergency_contact_name: null,
      emergency_contact_phone: null,
      waiver_accepted_at: null,
      waiver_version: null,
      roster_opt_in: false,
      checked_in_at: null,
      checked_in_by: null,
    })
  })
})

describe('CHECKIN_COLUMNS', () => {
  it('selects what outcome and display need', () => {
    expect(CHECKIN_COLUMNS.split(',').map((c) => c.trim()).sort()).toEqual([
      'checked_in_at', 'first_name', 'id', 'last_name', 'rsvp_status', 'school',
    ])
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run supabase/functions/admin-applications/checkin.test.js`
Expected: FAIL, module not found.

- [ ] **Step 3: Write `checkin.ts`**

```ts
// The pure half of door check-in. Deno-free so it runs under vitest, like
// ../submit-application/application.ts -- which this cannot import, because
// Supabase bundles each function directory on its own. The uuid pattern is
// therefore repeated here.

const UUID_RE_G = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi

export const CHECKIN_COLUMNS = [
  'id',
  'first_name',
  'last_name',
  'school',
  'rsvp_status',
  'checked_in_at',
].join(', ')

export type CheckinRow = {
  id: string
  first_name: string | null
  last_name: string | null
  school: string | null
  rsvp_status: 'pending' | 'attending' | 'declined'
  checked_in_at: string | null
}

export type CheckinResult =
  | 'checked_in'
  | 'already_checked_in'
  | 'not_attending'
  | 'not_found'

/**
 * A scan yields whatever the QR encoded -- the status URL -- and a typed
 * fallback yields a bare token. Both carry exactly one uuid; take the last
 * match so a query string after it cannot confuse things.
 */
export function extractStatusToken(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const matches = raw.trim().match(UUID_RE_G)
  if (!matches || matches.length === 0) return null
  return matches[matches.length - 1].toLowerCase()
}

export function checkinOutcome(row: CheckinRow | null): CheckinResult {
  if (!row) return 'not_found'
  if (row.rsvp_status !== 'attending') return 'not_attending'
  if (row.checked_in_at) return 'already_checked_in'
  return 'checked_in'
}

export function publicCheckinFields(row: CheckinRow) {
  return {
    first_name: row.first_name,
    last_name: row.last_name,
    school: row.school,
    checked_in_at: row.checked_in_at,
  }
}

/** The one shape the trigger accepts as a reset (see rule 2). */
export function rsvpResetUpdate() {
  return {
    rsvp_status: 'pending' as const,
    rsvp_at: null,
    dietary_restrictions: null,
    emergency_contact_name: null,
    emergency_contact_phone: null,
    waiver_accepted_at: null,
    waiver_version: null,
    roster_opt_in: false,
    checked_in_at: null,
    checked_in_by: null,
  }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run supabase/functions/admin-applications/checkin.test.js`
Expected: PASS.

- [ ] **Step 5: Add the check-in actions to `index.ts`**

Import at the top:

```ts
import {
  CHECKIN_COLUMNS,
  checkinOutcome,
  extractStatusToken,
  publicCheckinFields,
  rsvpResetUpdate,
  type CheckinRow,
} from './checkin.ts';
```

Insert before `if (req.method === 'POST' && body.action === 'list')`:

```ts
    // Door check-in. Every outcome is a 200 with a `result`: from the scan
    // page's point of view "not attending" and "unknown code" are answers to
    // show in red, not failures to retry.
    if (
      req.method === 'POST' &&
      (body.action === 'checkin' || body.action === 'checkin_by_email')
    ) {
      let query = adminClient.from('applications').select(CHECKIN_COLUMNS);
      if (body.action === 'checkin') {
        const token = extractStatusToken(body.statusToken);
        if (!token) {
          return jsonResponse({ result: 'not_found', application: null }, 200, corsHeaders);
        }
        query = query.eq('status_token', token);
      } else {
        const email = String(body.email ?? '').trim().toLowerCase();
        if (!email) {
          return jsonResponse({ error: 'Missing email.' }, 400, corsHeaders);
        }
        // Rows written by submit-application are already lowercased; the
        // unique index is on lower(email), so this matches at most one row.
        query = query.ilike('email', email.replace(/[%_]/g, '\\$&'));
      }

      const { data: found, error: findError } = await query.maybeSingle();
      if (findError) {
        return jsonResponse({ error: findError.message }, 400, corsHeaders);
      }
      const row = (found as CheckinRow | null) ?? null;
      const outcome = checkinOutcome(row);
      if (outcome !== 'checked_in') {
        return jsonResponse(
          { result: outcome, application: row ? publicCheckinFields(row) : null },
          200,
          corsHeaders,
        );
      }

      // `is('checked_in_at', null)` makes two doors scanning the same person
      // at once race safely: one update matches, the other sees the result.
      const { data: updated, error: updateError } = await adminClient
        .from('applications')
        .update({ checked_in_at: new Date().toISOString(), checked_in_by: user.email })
        .eq('id', row!.id)
        .is('checked_in_at', null)
        .select(CHECKIN_COLUMNS)
        .maybeSingle();
      if (updateError) {
        return jsonResponse({ error: updateError.message }, 400, corsHeaders);
      }
      if (!updated) {
        const { data: again } = await adminClient
          .from('applications')
          .select(CHECKIN_COLUMNS)
          .eq('id', row!.id)
          .maybeSingle();
        return jsonResponse(
          {
            result: 'already_checked_in',
            application: publicCheckinFields((again as CheckinRow) ?? row!),
          },
          200,
          corsHeaders,
        );
      }
      return jsonResponse(
        { result: 'checked_in', application: publicCheckinFields(updated as CheckinRow) },
        200,
        corsHeaders,
      );
    }
```

- [ ] **Step 6: Rework the PATCH handler**

Replace the body of `if (req.method === 'PATCH') { ... }` from `const updates` down to the update call with:

```ts
      const { data: current, error: currentError } = await adminClient
        .from('applications')
        .select('status, rsvp_status')
        .eq('id', body.id)
        .maybeSingle();
      if (currentError) {
        return jsonResponse({ error: currentError.message }, 400, corsHeaders);
      }
      if (!current) {
        return jsonResponse({ error: 'Application not found.' }, 404, corsHeaders);
      }

      const updates: Record<string, unknown> = {};
      const now = new Date().toISOString();

      if (body.status) {
        if (!allowedStatuses.has(body.status)) {
          return jsonResponse({ error: 'Invalid status.' }, 400, corsHeaders);
        }
        // Only a real change is a decision. Re-saving the same status (to
        // edit notes, say) used to re-stamp decided_at, which would now
        // silently extend a late admit's 24-hour RSVP window.
        if (body.status !== current.status) {
          const decided = ['admitted', 'waitlisted', 'rejected'].includes(body.status);
          updates.status = body.status;
          updates.decided_at = decided ? now : null;
          updates.decided_by = decided ? user.email : null;
        }
      }

      if (typeof body.admin_notes === 'string') {
        updates.admin_notes = body.admin_notes;
      }

      if (body.rsvp_reset === true) {
        Object.assign(updates, rsvpResetUpdate());
      }

      if (typeof body.checked_in === 'boolean') {
        if (body.checked_in && current.rsvp_status !== 'attending') {
          return jsonResponse(
            { error: 'Only someone who RSVP’d as attending can be checked in.' },
            409,
            corsHeaders,
          );
        }
        updates.checked_in_at = body.checked_in ? now : null;
        updates.checked_in_by = body.checked_in ? user.email : null;
      }

      if (Object.keys(updates).length === 0) {
        return jsonResponse({ error: 'Nothing to update.' }, 400, corsHeaders);
      }

      const { data, error: updateError } = await adminClient
        .from('applications')
        .update(updates)
        .eq('id', body.id)
        .select('*')
        .single();
```

Keep the existing error/return lines after the update.

- [ ] **Step 7: Type-check, test, deploy**

Run: `deno check supabase/functions/admin-applications/index.ts` (if available) and `npm test`.
Then, if the CLI is logged in: `npx supabase@latest functions deploy admin-applications`. Otherwise note it for the Task 12 checklist.
Expected: no type errors; tests PASS.

- [ ] **Step 8: Commit**

```bash
git add supabase/functions/admin-applications/checkin.ts supabase/functions/admin-applications/checkin.test.js supabase/functions/admin-applications/index.ts
git commit -m "Add door check-in, RSVP reset and manual check-in to the admin function"
```

---

### Task 9: Admin client — service calls, RSVP counts, count strip

**Files:**
- Modify: `src/admissions/applicationService.js` (append after `createAdminResumeUrl`)
- Create: `src/admissions/admin/rsvpSummary.js`, `src/admissions/admin/rsvpSummary.test.js`, `src/admissions/admin/RsvpSummary.jsx`

**Interfaces:**
- Consumes: Task 8's action shapes; `updateAdminApplication` (existing).
- Produces: `checkInByToken(statusToken) → { result, application }`, `checkInByEmail(email) → same`; `summarizeRsvps(applications) → { admitted, attending, declined, pending, checkedIn }`; `<RsvpSummary applications />`.

- [ ] **Step 1: Write the failing summary test**

```js
import { describe, it, expect } from 'vitest';
import { summarizeRsvps } from './rsvpSummary';

const row = (status, rsvp_status = 'pending', checked_in_at = null) => ({ status, rsvp_status, checked_in_at });

describe('summarizeRsvps', () => {
  it('counts only admitted applications', () => {
    const out = summarizeRsvps([
      row('admitted'),
      row('admitted', 'attending'),
      row('admitted', 'attending', '2026-09-12T13:00:00Z'),
      row('admitted', 'declined'),
      row('waitlisted'),
      row('submitted'),
    ]);
    expect(out).toEqual({ admitted: 4, attending: 2, declined: 1, pending: 1, checkedIn: 1 });
  });

  it('is all zeros for an empty list', () => {
    expect(summarizeRsvps([])).toEqual({ admitted: 0, attending: 0, declined: 0, pending: 0, checkedIn: 0 });
  });
});
```

- [ ] **Step 2: Write `rsvpSummary.js`**

```js
/** The headcount. Attending includes the checked-in; pending is the gap. */
export function summarizeRsvps(applications) {
  const admitted = applications.filter((a) => a.status === 'admitted');
  return {
    admitted: admitted.length,
    attending: admitted.filter((a) => a.rsvp_status === 'attending').length,
    declined: admitted.filter((a) => a.rsvp_status === 'declined').length,
    pending: admitted.filter((a) => a.rsvp_status === 'pending').length,
    checkedIn: admitted.filter((a) => a.checked_in_at).length,
  };
}
```

- [ ] **Step 3: Write `RsvpSummary.jsx`**

```jsx
import { summarizeRsvps } from './rsvpSummary';

const CELLS = [
  ['Admitted', 'admitted', 'text-white'],
  ['Attending', 'attending', 'text-emerald-300'],
  ['Declined', 'declined', 'text-rose-300'],
  ['Pending', 'pending', 'text-secondary-fixed'],
  ['Checked in', 'checkedIn', 'text-primary'],
];

export default function RsvpSummary({ applications }) {
  const counts = summarizeRsvps(applications);
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
      {CELLS.map(([label, key, tone]) => (
        <div
          className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3"
          key={key}
        >
          <div className="font-mono text-[10px] font-bold uppercase tracking-widest text-outline">
            {label}
          </div>
          <div className={`mt-1 font-display text-2xl font-black ${tone}`}>
            {counts[key]}
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Add the service calls**

Append to `applicationService.js`:

```js
async function callAdminFunction(body) {
  const client = requireSupabase();
  const { data, error } = await client.functions.invoke(
    portalConfig.adminFunctionName,
    { method: 'POST', body },
  );
  if (error) {
    throw await toFunctionError(error);
  }
  return data;
}

/**
 * Door check-in. Resolves to `{ result, application }` where result is one of
 * checked_in | already_checked_in | not_attending | not_found. These are
 * outcomes, not errors: the scan page shows each in its own colour.
 */
export function checkInByToken(statusToken) {
  return callAdminFunction({ action: 'checkin', statusToken });
}

export function checkInByEmail(email) {
  return callAdminFunction({ action: 'checkin_by_email', email });
}
```

- [ ] **Step 5: Run to verify pass, lint**

Run: `npx vitest run src/admissions/admin/rsvpSummary.test.js && npm run lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/admissions/applicationService.js src/admissions/admin/rsvpSummary.js src/admissions/admin/rsvpSummary.test.js src/admissions/admin/RsvpSummary.jsx
git commit -m "Add check-in service calls and the RSVP headcount strip"
```

---

### Task 10: Console UI — RSVP column, filter, headcount, detail actions, attending export

**Files:**
- Modify: `src/pages/AdmissionsAdminPage.jsx` (imports; `ApplicationDetail`; page state, filters, table, toolbar)

**Interfaces:**
- Consumes: `RsvpBadge` (Task 6), `RsvpSummary` (Task 9), `buildAttendingCsv` (Task 7), `rsvpBadgeKey`, `portalConfig.rsvpStatuses` (Task 4), `updateAdminApplication` with `{ rsvp_reset: true }` / `{ checked_in: boolean }` (Task 8).
- Produces: nothing new for later tasks. Task 11 links to the scan page from here.

- [ ] **Step 1: Imports and filter state**

Add imports:

```jsx
import { Link } from "react-router-dom";
import { QrCode } from "lucide-react";
import RsvpBadge from "../admissions/RsvpBadge";
import RsvpSummary from "../admissions/admin/RsvpSummary";
import { buildAttendingCsv } from "../admissions/admin/exports";
import { rsvpBadgeKey } from "../admissions/portalConfig";
```

Add `const rsvpOptions = Object.keys(portalConfig.rsvpStatuses);` next to `statusOptions`. In the component add `const [rsvpFilter, setRsvpFilter] = useState("all");` and extend `filteredApplications`:

```jsx
      const matchesRsvp =
        rsvpFilter === "all" || rsvpBadgeKey(application) === rsvpFilter;
```

and `return matchesStatus && matchesSchool && matchesRsvp && matchesSearch;` with `rsvpFilter` added to the `useMemo` deps.

- [ ] **Step 2: Toolbar**

After the school `<select>` add:

```jsx
              <select
                className="rounded-xl border border-primary/10 bg-surface-container-lowest/90 px-4 py-3 text-sm text-white outline-none focus:border-primary/50"
                onChange={(event) => setRsvpFilter(event.target.value)}
                value={rsvpFilter}
              >
                <option value="all">All RSVPs</option>
                {rsvpOptions.map((key) => (
                  <option key={key} value={key}>
                    {portalConfig.rsvpStatuses[key].label}
                  </option>
                ))}
              </select>
```

After the Export Admitted button add:

```jsx
              <button
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-400/30 bg-emerald-400/5 px-4 py-3 font-mono text-[10px] font-bold uppercase tracking-widest text-emerald-300 hover:bg-emerald-400/10"
                onClick={() =>
                  downloadCsv("bots-attending.csv", buildAttendingCsv(applications))
                }
                type="button"
              >
                <Download size={14} />
                Export Attending
              </button>

              <Link
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 font-mono text-[10px] font-bold uppercase tracking-widest text-primary hover:bg-primary/10"
                to={`${portalConfig.adminPath}/checkin`}
              >
                <QrCode size={14} />
                Door Scan
              </Link>
```

Change the toolbar grid to `lg:grid-cols-[1fr_repeat(3,minmax(0,auto))] xl:flex xl:flex-wrap` so it wraps rather than overflowing. Below the toolbar panel, before the error/message blocks, render `<RsvpSummary applications={applications} />`.

- [ ] **Step 3: Table column**

Add a header `<th className="px-5 py-3 font-mono">RSVP</th>` after Status, and a cell after the status cell:

```jsx
                        <td className="px-5 py-4">
                          {application.status === "admitted" ? (
                            <RsvpBadge application={application} />
                          ) : (
                            <span className="text-outline">-</span>
                          )}
                        </td>
```

Bump the table's `min-w-[760px]` to `min-w-[880px]`.

- [ ] **Step 4: Detail panel**

Inside `ApplicationDetail`, add state `const [confirmReset, setConfirmReset] = useState(false);` and, after the Links/Resume block and before the responses block, add:

```jsx
      {application.status === "admitted" && (
        <div className="mt-6 space-y-4 border-t border-white/10 pt-6">
          <div className="flex items-center justify-between">
            <div className="font-mono text-[10px] font-bold uppercase tracking-widest text-outline">
              RSVP
            </div>
            <RsvpBadge application={application} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <DetailText label="Responded">{formatDate(application.rsvp_at)}</DetailText>
            <DetailText label="Waiver">
              {application.waiver_accepted_at
                ? `${application.waiver_version} · ${formatDate(application.waiver_accepted_at)}`
                : null}
            </DetailText>
            <DetailText label="Emergency contact">
              {application.emergency_contact_name
                ? `${application.emergency_contact_name} · ${application.emergency_contact_phone}`
                : null}
            </DetailText>
            <DetailText label="Dietary">{application.dietary_restrictions}</DetailText>
            <DetailText label="Public roster">
              {application.rsvp_status === "attending"
                ? application.roster_opt_in ? "Opted in" : "Opted out"
                : null}
            </DetailText>
            <DetailText label="Checked in">
              {application.checked_in_at
                ? `${formatDate(application.checked_in_at)} by ${application.checked_in_by}`
                : null}
            </DetailText>
          </div>

          <div className="flex flex-wrap gap-2">
            {application.rsvp_status === "attending" && !application.checked_in_at && (
              <button
                className="rounded-full border border-primary/30 bg-primary/5 px-4 py-2 font-mono text-[10px] font-bold uppercase tracking-widest text-primary hover:bg-primary/10 disabled:opacity-60"
                disabled={updating}
                onClick={() => onUpdate(application.id, { checked_in: true })}
                type="button"
              >
                Check in manually
              </button>
            )}
            {application.checked_in_at && (
              <button
                className="rounded-full border border-white/10 bg-white/5 px-4 py-2 font-mono text-[10px] font-bold uppercase tracking-widest text-on-surface-variant hover:text-white disabled:opacity-60"
                disabled={updating}
                onClick={() => onUpdate(application.id, { checked_in: false })}
                type="button"
              >
                Undo check-in
              </button>
            )}
            {application.rsvp_status !== "pending" && !confirmReset && (
              <button
                className="rounded-full border border-rose-400/30 bg-rose-400/5 px-4 py-2 font-mono text-[10px] font-bold uppercase tracking-widest text-rose-300 hover:bg-rose-400/10"
                onClick={() => setConfirmReset(true)}
                type="button"
              >
                Reset RSVP
              </button>
            )}
            {confirmReset && (
              <>
                <button
                  className="rounded-full bg-rose-500/80 px-4 py-2 font-mono text-[10px] font-bold uppercase tracking-widest text-white disabled:opacity-60"
                  disabled={updating}
                  onClick={() => {
                    setConfirmReset(false);
                    onUpdate(application.id, { rsvp_reset: true });
                  }}
                  type="button"
                >
                  Confirm reset — they will need to RSVP again
                </button>
                <button
                  className="rounded-full border border-white/10 px-4 py-2 font-mono text-[10px] uppercase tracking-widest text-outline"
                  onClick={() => setConfirmReset(false)}
                  type="button"
                >
                  Cancel
                </button>
              </>
            )}
          </div>
        </div>
      )}
```

`handleUpdate` already merges the returned row into state, so badges and counts refresh without a reload.

- [ ] **Step 5: Verify**

Run: `npm test && npm run lint && npm run build`. Then `npm run dev`, sign in at the admin path, and confirm: the RSVP column and filter appear, the count strip shows numbers, the detail panel of an admitted row shows the RSVP block, and Export Attending downloads a file whose first line is the header from Task 7.
Expected: all green; manual checks as described.

- [ ] **Step 6: Commit**

```bash
git add src/pages/AdmissionsAdminPage.jsx
git commit -m "Show RSVP state, headcount, reset and manual check-in in the console"
```

---

### Task 11: Door scan page

**Files:**
- Modify: `package.json` (add `jsqr`)
- Create: `src/admissions/admin/scan.js`, `src/admissions/admin/scan.test.js`, `src/admissions/admin/useQrScanner.js`, `src/pages/CheckInPage.jsx`
- Modify: `src/App.jsx` (route)

**Interfaces:**
- Consumes: `checkInByToken`, `checkInByEmail` (Task 9); `useSupabaseSession`, `AuthPanel`, `PortalShell` (existing).
- Produces: `parseScannedToken(text) → uuid | null`, `describeCheckin(response, now?) → { tone: 'green'|'yellow'|'red', title, detail }`, `useQrScanner({ enabled, onDecode })`, route `${portalConfig.adminPath}/checkin`.

- [ ] **Step 1: Install the decoder**

Run: `npm install jsqr@1.4.0`

- [ ] **Step 2: Write the failing tests**

```js
import { describe, it, expect } from 'vitest';
import { describeCheckin, parseScannedToken } from './scan';

const TOKEN = '11111111-1111-1111-1111-111111111111';

describe('parseScannedToken', () => {
  it('reads a token out of the URL the ticket encodes', () => {
    expect(parseScannedToken(`https://utwat.ca/apply/status/${TOKEN}`)).toBe(TOKEN);
  });
  it('accepts a bare token and rejects noise', () => {
    expect(parseScannedToken(TOKEN.toUpperCase())).toBe(TOKEN);
    expect(parseScannedToken('WIFI:S:hackathon;;')).toBeNull();
    expect(parseScannedToken('')).toBeNull();
  });
});

describe('describeCheckin', () => {
  const ada = { first_name: 'Ada', last_name: 'Lovelace', school: 'University of Waterloo', checked_in_at: null };

  it('is green for a fresh check-in, naming the person', () => {
    const out = describeCheckin({ result: 'checked_in', application: ada });
    expect(out.tone).toBe('green');
    expect(out.title).toMatch(/checked in/i);
    expect(out.detail).toContain('Ada Lovelace');
  });

  it('is yellow with the time for a repeat', () => {
    const out = describeCheckin({
      result: 'already_checked_in',
      application: { ...ada, checked_in_at: '2026-09-12T13:05:00Z' },
    });
    expect(out.tone).toBe('yellow');
    expect(out.title).toMatch(/already/i);
    expect(out.detail).toMatch(/9:05/);
  });

  it('is red for someone not attending, and for an unknown code', () => {
    expect(describeCheckin({ result: 'not_attending', application: ada }).tone).toBe('red');
    expect(describeCheckin({ result: 'not_attending', application: ada }).title).toMatch(/not attending/i);
    const unknown = describeCheckin({ result: 'not_found', application: null });
    expect(unknown.tone).toBe('red');
    expect(unknown.title).toMatch(/unknown/i);
  });
});
```

- [ ] **Step 3: Write `scan.js`**

```js
// Pure helpers for the door. Mirrors extractStatusToken in
// supabase/functions/admin-applications/checkin.ts; the server re-parses
// whatever this sends, so a mismatch here costs a red screen, not a bad row.

const UUID_RE_G = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

export function parseScannedToken(text) {
  if (typeof text !== 'string') return null;
  const matches = text.trim().match(UUID_RE_G);
  return matches ? matches[matches.length - 1].toLowerCase() : null;
}

const time = (value) =>
  new Intl.DateTimeFormat('en-CA', {
    timeStyle: 'short',
    timeZone: 'America/Toronto',
  }).format(new Date(value));

const fullName = (a) => [a?.first_name, a?.last_name].filter(Boolean).join(' ') || 'Unnamed';

/** result -> what the big screen says. Large, three colours, one glance. */
export function describeCheckin({ result, application }) {
  switch (result) {
    case 'checked_in':
      return {
        tone: 'green',
        title: 'Checked in',
        detail: `${fullName(application)} · ${application?.school ?? ''}`,
      };
    case 'already_checked_in':
      return {
        tone: 'yellow',
        title: 'Already checked in',
        detail: `${fullName(application)} · ${time(application.checked_in_at)}`,
      };
    case 'not_attending':
      return {
        tone: 'red',
        title: 'Not attending',
        detail: `${fullName(application)} has no attending RSVP. Send them to the desk.`,
      };
    default:
      return {
        tone: 'red',
        title: 'Unknown code',
        detail: 'Not one of ours. Try the name lookup below.',
      };
  }
}

export const TONE_CLASSES = {
  green: 'bg-emerald-500 text-white',
  yellow: 'bg-amber-400 text-black',
  red: 'bg-rose-600 text-white',
};
```

- [ ] **Step 4: Write `useQrScanner.js`**

```js
import { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';

/**
 * Rear camera into a <video>, frames onto an offscreen canvas, jsqr on each
 * frame. Calls onDecode(text) on every successful read; the caller owns
 * debouncing. Not unit-tested: it is all browser APIs jsdom lacks. Kept
 * deliberately small so a dry run on a real phone is the test.
 */
export function useQrScanner({ enabled, onDecode }) {
  const videoRef = useRef(null);
  const onDecodeRef = useRef(onDecode);
  const [error, setError] = useState('');
  onDecodeRef.current = onDecode;

  useEffect(() => {
    if (!enabled) return undefined;
    const video = videoRef.current;
    if (!video || !navigator.mediaDevices?.getUserMedia) {
      setError('This browser cannot open the camera. Use the name lookup.');
      return undefined;
    }

    let stream;
    let frame;
    let stopped = false;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    const tick = () => {
      if (stopped) return;
      if (video.readyState === video.HAVE_ENOUGH_DATA) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(image.data, image.width, image.height, {
          inversionAttempts: 'dontInvert',
        });
        if (code?.data) onDecodeRef.current(code.data);
      }
      frame = requestAnimationFrame(tick);
    };

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
      .then((s) => {
        if (stopped) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        stream = s;
        video.srcObject = s;
        video.setAttribute('playsinline', 'true');
        return video.play().then(() => {
          frame = requestAnimationFrame(tick);
        });
      })
      .catch((err) => {
        setError(err?.message || 'Camera permission was refused.');
      });

    return () => {
      stopped = true;
      if (frame) cancelAnimationFrame(frame);
      if (stream) stream.getTracks().forEach((t) => t.stop());
    };
  }, [enabled]);

  return { videoRef, error };
}
```

- [ ] **Step 5: Write `CheckInPage.jsx`**

```jsx
import { useCallback, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import AuthPanel from '../admissions/AuthPanel';
import PortalShell from '../admissions/PortalShell';
import { checkInByEmail, checkInByToken } from '../admissions/applicationService';
import { describeCheckin, parseScannedToken, TONE_CLASSES } from '../admissions/admin/scan';
import { useQrScanner } from '../admissions/admin/useQrScanner';
import { portalConfig } from '../admissions/portalConfig';
import { supabase } from '../admissions/supabaseClient';
import { useSupabaseSession } from '../admissions/useSupabaseSession';

const RESULT_MS = 2000;
const DEBOUNCE_MS = 5000;

export default function CheckInPage() {
  const { configured, loading, user } = useSupabaseSession();
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [count, setCount] = useState(0);
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const recent = useRef(new Map());

  const show = useCallback((response) => {
    const described = describeCheckin(response);
    setResult(described);
    if (response.result === 'checked_in') setCount((c) => c + 1);
    setTimeout(() => setResult(null), RESULT_MS);
  }, []);

  const handleDecode = useCallback(
    async (text) => {
      if (busy) return;
      const token = parseScannedToken(text);
      const key = token || text;
      const last = recent.current.get(key) || 0;
      if (Date.now() - last < DEBOUNCE_MS) return;
      recent.current.set(key, Date.now());

      if (!token) {
        show({ result: 'not_found', application: null });
        return;
      }
      setBusy(true);
      setError('');
      try {
        show(await checkInByToken(token));
      } catch (err) {
        setError(err.message || 'Check-in failed.');
      } finally {
        setBusy(false);
      }
    },
    [busy, show],
  );

  const { videoRef, error: cameraError } = useQrScanner({
    enabled: Boolean(user),
    onDecode: handleDecode,
  });

  const handleEmail = async (event) => {
    event.preventDefault();
    if (!email.trim()) return;
    setBusy(true);
    setError('');
    try {
      show(await checkInByEmail(email.trim()));
      setEmail('');
    } catch (err) {
      setError(err.message || 'Check-in failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <PortalShell
      admin
      eyebrow="Door"
      onSignOut={() => supabase?.auth.signOut()}
      subtitle="Point the camera at the attendee's ticket. Green means go."
      title="Check-in"
      user={user}
    >
      {!configured && (
        <div className="rounded-3xl border border-secondary-fixed/20 bg-secondary-fixed/5 p-8 text-on-surface-variant">
          Configure Supabase env vars before using the door page.
        </div>
      )}
      {configured && loading && (
        <div className="flex items-center gap-3 text-on-surface-variant">
          <Loader2 className="animate-spin text-primary" size={18} />
          Checking session...
        </div>
      )}
      {configured && !loading && !user && (
        <AuthPanel redirectPath={`${portalConfig.adminPath}/checkin`} />
      )}

      {configured && user && (
        <div className="mx-auto max-w-md space-y-5">
          <div className="relative overflow-hidden rounded-3xl border border-primary/20 bg-black">
            <video className="aspect-square w-full object-cover" muted ref={videoRef} />
            {result && (
              <div
                className={`absolute inset-0 flex flex-col items-center justify-center p-6 text-center ${TONE_CLASSES[result.tone]}`}
                role="status"
              >
                <div className="font-display text-4xl font-black uppercase">{result.title}</div>
                <div className="mt-3 text-lg">{result.detail}</div>
              </div>
            )}
          </div>

          {cameraError && (
            <div className="rounded-2xl border border-amber-400/30 bg-amber-950/20 p-4 text-sm text-amber-100">
              {cameraError}
            </div>
          )}
          {error && (
            <div className="rounded-2xl border border-rose-400/20 bg-rose-950/20 p-4 text-sm text-rose-100">
              {error}
            </div>
          )}

          <div className="flex items-center justify-between font-mono text-[10px] font-bold uppercase tracking-widest text-outline">
            <span>Checked in this session: {count}</span>
            <Link className="text-primary hover:underline" to={portalConfig.adminPath}>
              Back to console
            </Link>
          </div>

          <form className="flex gap-2" onSubmit={handleEmail}>
            <input
              aria-label="Attendee email"
              className="w-full rounded-xl border border-primary/10 bg-surface-container-lowest/90 px-4 py-3 text-sm text-white outline-none placeholder:text-outline focus:border-primary/50"
              inputMode="email"
              onChange={(event) => setEmail(event.target.value)}
              placeholder="No code? Type their email"
              value={email}
            />
            <button
              className="rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 font-mono text-[10px] font-bold uppercase tracking-widest text-primary hover:bg-primary/10 disabled:opacity-60"
              disabled={busy}
              type="submit"
            >
              Check in
            </button>
          </form>
        </div>
      )}
    </PortalShell>
  );
}
```

- [ ] **Step 6: Route**

In `App.jsx` add `import CheckInPage from './pages/CheckInPage';` and, after the admin route:

```jsx
          <Route path={`${portalConfig.adminPath}/checkin`} element={<CheckInPage />} />
```

- [ ] **Step 7: Verify**

Run: `npx vitest run src/admissions/admin/scan.test.js && npm test && npm run lint && npm run build`
Expected: PASS. Then the phone test: `npm run dev -- --host`, open the check-in URL on a phone over HTTPS or localhost (camera needs a secure context; use `npx vite --host` with the Vercel preview URL if local HTTPS is awkward), sign in with an allowlisted email, scan the QR from Task 6's ticket on another screen. Expect green, then yellow on a second scan.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json src/admissions/admin/scan.js src/admissions/admin/scan.test.js src/admissions/admin/useQrScanner.js src/pages/CheckInPage.jsx src/App.jsx
git commit -m "Add the door scan page"
```

---

### Task 12: README, runbook, and final verification

**Files:**
- Modify: `README.md` (after the admin-applications secrets section)

- [ ] **Step 1: Document the flow and the deploy steps**

Add a section:

```markdown
## Post-admission: RSVP, waiver, door check-in

Design: `docs/superpowers/specs/2026-09-05-post-admission-rsvp-checkin-design.md`.

An admitted applicant RSVPs from their status link (`/apply/status/<token>`).
The form only renders once `participantWaiver.placeholder` in
`src/legal/legalContent.js` is `false`; flipping it is the "waiver is live"
switch, and no decision email should go out before it. RSVPs close at
`portalConfig.rsvpDeadlineIso`; anyone admitted after that gets 24 hours.

Deploy:

```bash
npx supabase@latest db push                                # 202609060001_rsvp_checkin.sql
npx supabase@latest functions deploy submit-application    # status + rsvp
npx supabase@latest functions deploy admin-applications    # checkin, reset
```

Console additions (same admin path): RSVP column and filter, headcount strip,
**Export Admitted** (mail-merge CSV with `status_url`), **Export Attending**
(door clipboard, sorted by last name), and **Door Scan** at
`<adminPath>/checkin`.

### Door runbook (Sept 12)

1. Every organizer on the door is in `ADMIN_EMAIL_ALLOWLIST` and has signed
   in on their phone at `<adminPath>/checkin` the day before.
2. Print **Export Attending** the morning of.
3. Scan the attendee's ticket. Green: in. Yellow: already in. Red: send to
   the desk. No code: type their email on the same page, or tick the paper
   list and enter it later from the console (row → Check in manually).
4. After the rush, reconcile paper ticks from the console.
```

- [ ] **Step 2: Pre-launch checklist (run on Sept 7)**

Confirm each and record the result in the commit body:

- [ ] Migration applied; `select count(*) from applications where rsvp_status is not null;` equals the row count.
- [ ] Both functions deployed; the two curl calls from Task 3 Step 5 behave as described.
- [ ] A test application admitted in the console → its status page shows "RSVP opens shortly" (placeholder still true).
- [ ] With `placeholder` temporarily flipped to `false` on a local build only: RSVP yes → ticket with QR → scan page reads it green → console shows Checked In → Reset RSVP returns it to pending. Do not commit the flip.
- [ ] **Export Admitted** opens in Sheets with a working `status_url` column.

- [ ] **Step 3: Final verification**

Run: `npm test && npm run lint && npm run build`
Expected: all PASS.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "Document the RSVP and door check-in flow"
```

---

## Self-review notes

- **Spec §4 data model** → Task 1. **§4.4 config** → Task 4. **§5.1–5.2 status/rsvp** → Tasks 2–3. **§5.3–5.5 page states, form, ticket** → Tasks 5–6. **§5.6 waiver page** → Task 4. **§6.1 console** → Tasks 9–10. **§6.2 admin actions** → Task 8. **§6.3 exports** → Tasks 7, 10. **§6.4 scan page** → Task 11. **§6.5 clipboard** → Task 7 (sorted export) + Task 10 (manual check-in) + Task 12 runbook. **§7 sequencing** → task order and Task 12 checklist. **§8 testing** → every task. **§10 roster** → out of scope, `roster_opt_in` collected in Tasks 1–3, 6.
- **One state beyond the spec's table:** `rsvp-waiting` ("RSVP opens shortly"), which is how the spec's "no decision email before the waiver is live" rule becomes code rather than a reminder.
- **One behaviour fix not in the spec:** PATCH no longer re-stamps `decided_at` on a same-status save (Task 8), because the 24-hour grace rule made that harmless quirk into a window-extending one.
