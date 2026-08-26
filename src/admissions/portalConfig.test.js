import { describe, it, expect } from 'vitest'
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
