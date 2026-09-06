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
export const WAIVER_VERSION = '2026-09-06'

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
