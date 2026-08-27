// The pure half of submit-application: what counts as a valid application and
// what row it becomes. Split out from index.ts for the same reason
// _shared/identity.ts is split out of faction-cheer -- it can then be tested
// under vitest without a Deno runtime or a Postgres, and this is the logic
// most worth pinning. A mistake here does not throw; it silently accepts a
// malformed application or silently rejects a good one, and the only place
// either shows up is in a reviewer's spreadsheet weeks later.
//
// Everything here duplicates a rule that also exists in
// src/admissions/applicationValidation.js or as a CHECK constraint on the
// table. That duplication is the point: the client copy exists to give fast
// feedback, and a server that trusts the client's idea of what is required is
// not validating at all.

// Kept in lockstep with portalConfig.applicationDeadlineIso by
// src/admissions/portalConfig.test.js, which reads this literal out of this
// file and fails on drift. It used to live in the submit_application RPC;
// that function required auth.uid() and was dropped along with accounts.
//
// A stale value here does not merely disagree with the UI. This module backs
// the only writer there is, so it rejects every submission outright -- which
// is exactly what happened when a July deadline outlived a July event.
export const DEADLINE = '2026-09-08T23:59:00-04:00'

export const ALLOWED_SCHOOLS = [
  'University of Toronto St. George',
  'University of Toronto Mississauga',
  'University of Toronto Scarborough',
  'University of Waterloo',
]

export const REQUIRED_TEXT = [
  'first_name',
  'last_name',
  'email',
  'phone',
  'school',
  'program',
  'level_of_study',
  'graduation_year',
  'preferred_track',
  'why_bots',
  'project_story',
  'future_build',
]

export const REQUIRED_BOOLEANS = [
  'over_18',
  'can_attend_in_person',
  'agree_privacy',
  'agree_accuracy',
]

export const LINK_FIELDS = [
  'github_url',
  'linkedin_url',
  'portfolio_url',
  'devpost_url',
]

export const RESPONSE_FIELDS = [
  'why_bots',
  'project_story',
  'future_build',
  'anything_else',
  'joke',
]

// Same caps as the CHECK constraints in 202606280001_admissions_security_
// hardening.sql. Enforced here as well so an oversized field comes back as a
// field error the form can point at, instead of as a 500 from a constraint
// violation that tells the applicant nothing.
export const MAX_LENGTHS: Record<string, number> = {
  first_name: 200,
  last_name: 200,
  email: 320,
  phone: 50,
  program: 300,
  school: 200,
  level_of_study: 100,
  graduation_year: 20,
  ml_skill_level: 100,
  hackathon_count: 20,
  preferred_track: 200,
}

export const MAX_RESPONSE_LENGTH = 5000
export const MAX_LINK_LENGTH = 500

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// The shape submit-application itself issues in `resume-upload-url`, and the
// only shape it will accept back. A client that could name its own path could
// name somebody else's.
export const RESUME_PATH_RE = /^[0-9a-f-]{36}\/resume\.pdf$/

export function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export function isDeadlinePassed(now: Date = new Date()): boolean {
  return now > new Date(DEADLINE)
}

/**
 * Returns a map of field -> message; empty means acceptable. Shaped like
 * src/admissions/applicationValidation.js's output so the client can drop it
 * straight into the error state it already renders.
 */
export function validate(form: Record<string, unknown>): Record<string, string> {
  const errors: Record<string, string> = {}

  for (const field of REQUIRED_TEXT) {
    if (!str(form[field])) errors[field] = 'This field is required.'
  }
  for (const field of REQUIRED_BOOLEANS) {
    if (form[field] !== true) errors[field] = 'This confirmation is required.'
  }

  const email = str(form.email)
  if (email && !EMAIL_RE.test(email)) {
    errors.email = 'Enter a valid email address.'
  }

  if (!ALLOWED_SCHOOLS.includes(str(form.school))) {
    errors.school = 'Applications are only open to selected schools for v1.'
  }

  for (const [field, max] of Object.entries(MAX_LENGTHS)) {
    if (str(form[field]).length > max) {
      errors[field] = `Must be ${max} characters or fewer.`
    }
  }

  for (const field of RESPONSE_FIELDS) {
    if (str(form[field]).length > MAX_RESPONSE_LENGTH) {
      errors[field] = `Must be ${MAX_RESPONSE_LENGTH} characters or fewer.`
    }
  }

  for (const field of LINK_FIELDS) {
    const value = str(form[field])
    if (!value) continue
    if (value.length > MAX_LINK_LENGTH) {
      errors[field] = `Must be ${MAX_LINK_LENGTH} characters or fewer.`
    } else if (!/^https?:\/\//i.test(value)) {
      // Mirrors the DB trigger, which raises on any link that is not http(s).
      // A javascript: or data: URL here renders as an anchor in the admin
      // console -- stored XSS against a reviewer.
      errors[field] = 'Enter a full URL starting with https://.'
    }
  }

  const resumePath = str(form.resume_path)
  if (resumePath && !RESUME_PATH_RE.test(resumePath)) {
    errors.resume_path = 'Re-upload your resume.'
  }

  return errors
}

/**
 * The row as it will be inserted. Every server-owned column is set here and
 * none is read from the form: status is always 'submitted', submitted_at is
 * always now, and user_id is left null because this row belongs to an email
 * address rather than to an account. The column survives only for rows
 * created before accounts were removed.
 */
export function toRow(form: Record<string, unknown>, now: Date = new Date()) {
  return {
    // Lowercased to match applications_email_uniq, which indexes
    // lower(email). Storing the typed casing while the index folds it would
    // let 'A@x.ca' display as distinct from the 'a@x.ca' it collides with.
    email: str(form.email).toLowerCase(),
    status: 'submitted' as const,
    submitted_at: now.toISOString(),
    first_name: str(form.first_name),
    last_name: str(form.last_name),
    phone: str(form.phone),
    school: str(form.school),
    program: str(form.program),
    level_of_study: str(form.level_of_study),
    graduation_year: str(form.graduation_year),
    over_18: form.over_18 === true,
    can_attend_in_person: form.can_attend_in_person === true,
    ml_skill_level: str(form.ml_skill_level),
    hackathon_count: str(form.hackathon_count),
    preferred_track: str(form.preferred_track),
    resume_path: str(form.resume_path) || null,
    links: LINK_FIELDS.reduce<Record<string, string | null>>((acc, field) => {
      acc[field] = str(form[field]) || null
      return acc
    }, {}),
    responses: RESPONSE_FIELDS.reduce<Record<string, string>>((acc, field) => {
      acc[field] = str(form[field])
      return acc
    }, {}),
    agreements: {
      agree_code_of_conduct: form.agree_code_of_conduct === true,
      agree_privacy: form.agree_privacy === true,
      agree_accuracy: form.agree_accuracy === true,
    },
  }
}
