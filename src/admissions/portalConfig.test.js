import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { portalConfig, isDeadlinePassed, formatDeadline } from './portalConfig'

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
 * The submission deadline exists twice: once here, and once hard-coded inside
 * public.submit_application, which is the only path that can mark an
 * application submitted. When they drifted apart the portal advertised an open
 * window, accepted a complete form, and rejected the final click -- a failure
 * that no amount of front-end testing could see, because the front end was
 * right and the database was not.
 */
describe('server-side deadline', () => {
  const migrationsDir = join('supabase', 'migrations');

  /** The deadline from the newest migration that defines submit_application. */
  function deadlineInForce() {
    const defining = readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort()
      .filter((f) =>
        readFileSync(join(migrationsDir, f), 'utf8').includes(
          'function public.submit_application',
        ),
      );
    expect(defining.length).toBeGreaterThan(0);
    const newest = readFileSync(
      join(migrationsDir, defining[defining.length - 1]),
      'utf8',
    );
    const match = newest.match(/deadline\s+timestamptz\s*:=\s*'([^']+)'/);
    expect(match, 'submit_application must declare a deadline').not.toBeNull();
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
})
