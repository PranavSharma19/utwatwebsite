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
 * fallback yields a bare token. Both carry exactly one uuid; take the first
 * match so a query string appended after it (a tracking param, say) cannot
 * override the real token.
 */
export function extractStatusToken(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const matches = raw.trim().match(UUID_RE_G)
  if (!matches || matches.length === 0) return null
  return matches[0].toLowerCase()
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
