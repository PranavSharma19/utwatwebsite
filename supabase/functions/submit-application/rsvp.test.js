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
