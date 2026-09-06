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
