import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { portalConfig, isDeadlinePassed, formatDeadline, rsvpBadgeKey, formatRsvpDeadline } from './portalConfig'
import {
  ALLOWED_OPTIONS,
  ALLOWED_SCHOOLS,
} from '../../supabase/functions/submit-application/application.ts'
import {
  RSVP_DEADLINE,
  WAIVER_VERSION,
  MAX_DIETARY_LENGTH,
  MAX_CONTACT_NAME_LENGTH,
  MAX_CONTACT_PHONE_LENGTH,
  MIN_PHONE_DIGITS,
} from '../../supabase/functions/submit-application/rsvp.ts'
import { participantWaiver } from '../legal/legalContent'
import { RSVP_LIMITS } from './rsvpValidation'

/**
 * The dates are the one part of this config that goes wrong silently. The
 * portal shipped with a July deadline into late August: isDeadlinePassed()
 * returned true, ApplicationForm disabled itself, and every visitor to /apply
 * was told the deadline had passed. Nothing failed, nothing logged -- the
 * portal simply refused applications and looked like it meant to.
 *
 * These cannot detect a stale date (a test that demands the deadline be in
 * the future would start failing the moment the event ends, and get deleted).
 * They pin the things that CAN be checked: that the parts agree with each
 * other, so a hand-edited prose string and the timestamp the logic reads
 * cannot drift apart unnoticed.
 */
const eventStart = new Date(`${portalConfig.eventStartIso}T00:00:00-04:00`)
const eventEnd = new Date(`${portalConfig.eventEndIso}T23:59:59-04:00`)
const deadline = new Date(portalConfig.applicationDeadlineIso)

describe('portalConfig dates', () => {
  it('parses every date it declares', () => {
    for (const [label, date] of [
      ['eventStartIso', eventStart],
      ['eventEndIso', eventEnd],
      ['applicationDeadlineIso', deadline],
    ]) {
      expect(Number.isNaN(date.getTime()), `${label} is unparseable`).toBe(false)
    }
  })

  it('closes applications before the event starts', () => {
    expect(deadline.getTime()).toBeLessThan(eventStart.getTime())
  })

  it('does not run the event backwards', () => {
    expect(eventStart.getTime()).toBeLessThanOrEqual(eventEnd.getTime())
  })

  // The prose string is what applicants actually read -- on the deadline
  // panel, in the portal header, and in the "I can attend in person for ..."
  // consent checkbox they tick. If it disagrees with the ISO dates, the
  // checkbox commits them to dates the event is not held on.
  it('describes the same days in eventDateRange that it stores in ISO', () => {
    const fmt = (d) =>
      new Intl.DateTimeFormat('en-US', { month: 'long', timeZone: 'UTC' }).format(d)
    const startMonth = fmt(new Date(`${portalConfig.eventStartIso}T12:00:00Z`))
    const endMonth = fmt(new Date(`${portalConfig.eventEndIso}T12:00:00Z`))
    const [, , startDay] = portalConfig.eventStartIso.split('-')
    const [, , endDay] = portalConfig.eventEndIso.split('-')

    expect(portalConfig.eventDateRange).toContain(startMonth)
    expect(portalConfig.eventDateRange).toContain(endMonth)
    expect(portalConfig.eventDateRange).toContain(String(Number(startDay)))
    expect(portalConfig.eventDateRange).toContain(String(Number(endDay)))
    expect(portalConfig.eventDateRange).toContain(portalConfig.eventYear)
  })

  it('states the deadline in Toronto time, where the applicants are', () => {
    // -04:00 through the summer, -05:00 once EST returns on 2026-11-01.
    expect(portalConfig.applicationDeadlineIso).toMatch(/-0[45]:00$/)
  })
})

describe('isDeadlinePassed', () => {
  it('is false a minute before and true a minute after', () => {
    expect(isDeadlinePassed(new Date(deadline.getTime() - 60_000))).toBe(false)
    expect(isDeadlinePassed(new Date(deadline.getTime() + 60_000))).toBe(true)
  })

  it('still accepts an application during the final minute', () => {
    expect(isDeadlinePassed(new Date(deadline.getTime() - 1))).toBe(false)
  })
})

describe('formatDeadline', () => {
  it('renders the configured day, not a shifted one', () => {
    // The failure this guards: formatting a -04:00 timestamp in UTC pushes
    // 11:59 PM onto the following date, so the portal would advertise a
    // deadline a day later than the one it enforces.
    const [, month, day] = portalConfig.applicationDeadlineIso
      .slice(0, 10)
      .split('-')
    const rendered = formatDeadline()
    expect(rendered).toContain(String(Number(day)))
    expect(rendered).toContain(
      new Intl.DateTimeFormat('en-US', { month: 'long', timeZone: 'UTC' })
        .format(new Date(`2026-${month}-15T12:00:00Z`)),
    )
  })
})

describe('portalConfig contact addresses', () => {
  it('are addresses, not placeholders on a domain the event does not own', () => {
    for (const key of ['contactEmail', 'sponsorEmail']) {
      expect(portalConfig[key], key).toMatch(/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i)
      expect(portalConfig[key], key).not.toMatch(/botu\.ca|example\.|placeholder|test\.com/i)
    }
  })
})

/**
 * The placeholder addresses above went stale for a specific reason: nothing
 * read them. Both mailto links on the site hardcoded the real address, so the
 * config could say anything at all and no page would change. This scans the
 * source for a literal mailto rather than trusting that to stay true.
 */
describe('contact links', () => {
  const walk = (dir) =>
    readdirSync(dir).flatMap((entry) => {
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) return walk(full)
      return /\.(jsx?|tsx?)$/.test(entry) && !/\.test\./.test(entry) ? [full] : []
    })

  it('are built from portalConfig, never hardcoded', () => {
    const offenders = walk('src').filter((file) =>
      // A mailto followed by anything other than an interpolation is a
      // literal address that portalConfig cannot reach.
      /mailto:(?!\$\{)/.test(readFileSync(file, 'utf8')),
    )
    expect(offenders, `hardcoded mailto in: ${offenders.join(', ')}`).toEqual([])
  })
})

/**
 * The submission deadline exists twice: once here, and once hard-coded in
 * supabase/functions/submit-application/application.ts, which backs the only
 * writer that can create a submitted application. When they drifted apart the
 * portal advertised an open window, accepted a complete form, and rejected the
 * final click -- a failure that no amount of front-end testing could see,
 * because the front end was right and the server was not.
 *
 * It used to live in the public.submit_application RPC. That function required
 * auth.uid() and was dropped along with the account requirement, so this guard
 * follows the value to the edge function rather than being deleted with it --
 * the drift it catches is a property of having two copies, not of where the
 * second copy happens to live.
 */
describe('server-side deadline', () => {
  const applicationModule = join(
    'supabase',
    'functions',
    'submit-application',
    'application.ts',
  );

  function deadlineInForce() {
    const source = readFileSync(applicationModule, 'utf8');
    const match = source.match(/export const DEADLINE\s*=\s*'([^']+)'/);
    expect(match, 'application.ts must export a DEADLINE').not.toBeNull();
    return match[1];
  }

  it('matches the deadline the portal advertises', () => {
    expect(new Date(deadlineInForce()).toISOString()).toBe(
      new Date(portalConfig.applicationDeadlineIso).toISOString(),
    );
  });

  it('has not already passed at the time the suite runs', () => {
    // A deadline in the past means submissions are being refused right now.
    expect(new Date(deadlineInForce()).getTime()).toBeGreaterThan(Date.now());
  });

  // The RPC is gone; a migration re-creating it would reintroduce a second
  // server-side deadline that this guard does not read.
  it('is not also defined by a lingering submit_application RPC', () => {
    const migrationsDir = join('supabase', 'migrations');
    const defining = readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort()
      .filter((f) =>
        /create (or replace )?function public\.submit_application/.test(
          readFileSync(join(migrationsDir, f), 'utf8'),
        ),
      );
    const newest = readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort()
      .filter((f) =>
        readFileSync(join(migrationsDir, f), 'utf8').includes(
          'drop function if exists public.submit_application',
        ),
      );
    // Either it was never defined, or the drop is newer than every definition.
    expect(
      defining.length === 0 ||
        (newest.length > 0 && newest[newest.length - 1] > defining[defining.length - 1]),
      'a migration re-creates submit_application after it was dropped',
    ).toBe(true);
  });
})

// ---------------------------------------------------------------------------
// The Edge Function cannot import from src/, so its ALLOWED_OPTIONS is a
// hand-kept copy of the lists the form renders. Drift is not a cosmetic
// problem: the server rejects anything not on its list, so a value added here
// and not there turns into "Choose one of the listed options." on a dropdown
// the applicant picked from correctly.
// ---------------------------------------------------------------------------
describe('option lists match the server copy', () => {
  it.each([
    ['level_of_study', 'levelsOfStudy'],
    ['graduation_year', 'graduationYears'],
    ['preferred_track', 'tracks'],
    ['ml_skill_level', 'mlSkillLevels'],
    ['hackathon_count', 'hackathonCounts'],
  ])('%s matches portalConfig.%s', (serverField, configKey) => {
    expect(ALLOWED_OPTIONS[serverField]).toEqual(portalConfig[configKey]);
  });

  it('covers every closed-option field the server enforces', () => {
    expect(Object.keys(ALLOWED_OPTIONS).sort()).toEqual([
      'graduation_year',
      'hackathon_count',
      'ml_skill_level',
      'preferred_track',
      'level_of_study',
    ].sort());
  });

  it('school is enforced too, from its own list', () => {
    expect(ALLOWED_SCHOOLS).toEqual(portalConfig.allowedSchools);
  });
});

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

/**
 * The RSVP field caps exist three times: as constants in rsvp.ts (the write
 * path, whose error copy the applicant actually sees), as RSVP_LIMITS in
 * rsvpValidation.js (the client copy that shows a field error before a round
 * trip), and as char_length(...) CHECK constraints in the migration -- the
 * migration's own comment says these are "the same caps the edge function
 * enforces". Nothing pins that promise. If the edge function's cap were ever
 * raised above the migration's, the update would fail the CHECK, `index.ts`
 * would throw a bare updateError, and the applicant would see a 500 "internal
 * error" on a form that looked fine, with no field message.
 */
describe('rsvp field limits', () => {
  const migrationFile = join(
    'supabase',
    'migrations',
    '202609060001_rsvp_checkin.sql',
  )
  const migrationSource = readFileSync(migrationFile, 'utf8')

  function sqlCap(column) {
    const re = new RegExp(
      `check \\(${column} is null or char_length\\(${column}\\) <= (\\d+)\\)`,
    )
    const match = migrationSource.match(re)
    expect(
      match,
      `expected a char_length CHECK for ${column} in ${migrationFile}`,
    ).not.toBeNull()
    return Number(match[1])
  }

  it('dietary_restrictions agrees across rsvp.ts, rsvpValidation.js and the migration', () => {
    expect(MAX_DIETARY_LENGTH).toBe(RSVP_LIMITS.dietary_restrictions)
    expect(MAX_DIETARY_LENGTH).toBe(sqlCap('dietary_restrictions'))
  })

  it('emergency_contact_name agrees across rsvp.ts, rsvpValidation.js and the migration', () => {
    expect(MAX_CONTACT_NAME_LENGTH).toBe(RSVP_LIMITS.emergency_contact_name)
    expect(MAX_CONTACT_NAME_LENGTH).toBe(sqlCap('emergency_contact_name'))
  })

  it('emergency_contact_phone agrees across rsvp.ts, rsvpValidation.js and the migration', () => {
    expect(MAX_CONTACT_PHONE_LENGTH).toBe(RSVP_LIMITS.emergency_contact_phone)
    expect(MAX_CONTACT_PHONE_LENGTH).toBe(sqlCap('emergency_contact_phone'))
  })

  // Not a CHECK constraint -- there is no cheap way to count digits in SQL --
  // so this one is only pinned between the server and the client copy.
  it('the minimum phone digit count agrees between rsvp.ts and rsvpValidation.js', () => {
    expect(MIN_PHONE_DIGITS).toBe(RSVP_LIMITS.minPhoneDigits)
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

describe('venue and hacker guide', () => {
  // The site advertised dates with no place for months. These pin that the
  // venue reaches the three surfaces that need it: the landing hero, the FAQ
  // somebody searches, and the ticket they hold at the door.
  it('names a venue and an address', () => {
    expect(portalConfig.venue).toMatch(/\S/)
    expect(portalConfig.venueAddress).toMatch(/\S/)
    expect(portalConfig.venueShort).toMatch(/\S/)
    expect(portalConfig.venue).toContain(portalConfig.venueShort)
  })

  it('is rendered on the hero, the FAQ and the ticket', () => {
    for (const file of [
      ['src', 'components', 'Hero.jsx'],
      ['src', 'components', 'Faq.jsx'],
      ['src', 'admissions', 'TicketCard.jsx'],
    ]) {
      expect(readFileSync(join(...file), 'utf8')).toContain('portalConfig.venue')
    }
  })

  // Empty is the correct state until the guide exists; what must never
  // happen is a link rendered against an empty href, which resolves to the
  // current page. TicketCard guards on truthiness -- this pins that guard.
  it('keeps the hacker guide link out of the ticket until it has a URL', () => {
    expect(typeof portalConfig.hackerGuideUrl).toBe('string')
    if (portalConfig.hackerGuideUrl) {
      expect(portalConfig.hackerGuideUrl).toMatch(/^(https?:\/\/|\/)\S+/)
    }
    const ticket = readFileSync(join('src', 'admissions', 'TicketCard.jsx'), 'utf8')
    expect(ticket).toContain('portalConfig.hackerGuideUrl &&')
  })

  // policyLinks entries may never be empty (legalContent.test.jsx pins that).
  // hackerGuideUrl is deliberately allowed to be, so it must stay out.
  it('does not live in policyLinks', () => {
    expect(portalConfig.policyLinks.hackerGuide).toBeUndefined()
  })
})
