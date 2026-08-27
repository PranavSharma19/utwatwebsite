// The server's own view of what a valid application is. This matters more
// than the client copy in src/admissions/applicationValidation.js: applying
// no longer involves an account, so this module is what stands between an
// anonymous POST and a row in the applications table. A gap here is not a
// worse error message, it is a bad row nobody notices until review.
import { describe, expect, it } from 'vitest'
import {
  ALLOWED_SCHOOLS,
  DEADLINE,
  MAX_RESPONSE_LENGTH,
  MAX_TEAM_EMAILS,
  isDeadlinePassed,
  splitEmails,
  toRow,
  validate,
} from './application.ts'

function validForm(overrides = {}) {
  return {
    first_name: 'Ada',
    last_name: 'Lovelace',
    email: 'ada@example.com',
    phone: '+1 647 555 0100',
    school: ALLOWED_SCHOOLS[0],
    program: 'Computer Science',
    level_of_study: 'Undergraduate',
    graduation_year: '2027',
    preferred_track: 'Machine Learning',
    why_bots: 'Because.',
    project_story: 'A project.',
    future_build: 'A future.',
    over_18: true,
    can_attend_in_person: true,
    agree_privacy: true,
    agree_accuracy: true,
    ...overrides,
  }
}

describe('validate — happy path', () => {
  it('accepts a complete application', () => {
    expect(validate(validForm())).toEqual({})
  })

  it('accepts one with every optional field left out', () => {
    const form = validForm()
    expect(validate(form)).toEqual({})
    expect(form.github_url).toBeUndefined()
  })
})

describe('validate — required fields', () => {
  it.each([
    'first_name',
    'last_name',
    'email',
    'phone',
    'program',
    'why_bots',
    'project_story',
    'future_build',
  ])('rejects a missing %s', (field) => {
    expect(validate(validForm({ [field]: '' }))).toHaveProperty(field)
  })

  it('treats whitespace as missing', () => {
    expect(validate(validForm({ first_name: '   ' })).first_name).toBe(
      'This field is required.',
    )
  })

  it('rejects a non-string where a string is required', () => {
    expect(validate(validForm({ first_name: 42 }))).toHaveProperty('first_name')
  })

  // The consent checkboxes are the ones with legal weight behind them, so
  // "truthy" is not good enough -- only an actual true counts.
  it.each(['over_18', 'can_attend_in_person', 'agree_privacy', 'agree_accuracy'])(
    'requires a literal true for %s',
    (field) => {
      expect(validate(validForm({ [field]: 'yes' }))).toHaveProperty(field)
      expect(validate(validForm({ [field]: 1 }))).toHaveProperty(field)
      expect(validate(validForm({ [field]: false }))).toHaveProperty(field)
    },
  )
})

describe('validate — email', () => {
  it.each(['ada', 'ada@', '@example.com', 'ada@example', 'a b@example.com'])(
    'rejects %s',
    (email) => {
      expect(validate(validForm({ email }))).toHaveProperty('email')
    },
  )

  it('accepts an ordinary university address', () => {
    expect(validate(validForm({ email: 'a1lovela@uwaterloo.ca' })).email).toBeUndefined()
  })

  it('reports an empty email as required rather than as malformed', () => {
    expect(validate(validForm({ email: '' })).email).toBe('This field is required.')
  })
})

describe('validate — school allowlist', () => {
  it('rejects a school that is not on the list', () => {
    expect(validate(validForm({ school: 'Some Other University' }))).toHaveProperty(
      'school',
    )
  })

  it.each(ALLOWED_SCHOOLS)('accepts %s', (school) => {
    expect(validate(validForm({ school })).school).toBeUndefined()
  })
})

describe('validate — links', () => {
  // The DB trigger raises on any link that is not http(s), and the admin
  // console renders these as anchors. A javascript: URL that got through here
  // would be stored XSS against a reviewer.
  it.each([
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'file:///etc/passwd',
    'github.com/ada',
  ])('rejects %s', (github_url) => {
    expect(validate(validForm({ github_url }))).toHaveProperty('github_url')
  })

  it('accepts http and https', () => {
    expect(validate(validForm({ github_url: 'https://github.com/ada' })).github_url)
      .toBeUndefined()
    expect(validate(validForm({ portfolio_url: 'http://ada.dev' })).portfolio_url)
      .toBeUndefined()
  })

  it('leaves an empty optional link alone', () => {
    expect(validate(validForm({ github_url: '  ' })).github_url).toBeUndefined()
  })
})

describe('validate — size caps', () => {
  // Every one of these mirrors a CHECK constraint. Without them the applicant
  // gets a raw Postgres constraint-violation string instead of a field error.
  it('rejects a first name past the column length', () => {
    expect(validate(validForm({ first_name: 'a'.repeat(201) }))).toHaveProperty(
      'first_name',
    )
  })

  it('rejects an over-long essay', () => {
    expect(
      validate(validForm({ why_bots: 'a'.repeat(MAX_RESPONSE_LENGTH + 1) })),
    ).toHaveProperty('why_bots')
  })

  it('accepts an essay exactly at the cap', () => {
    expect(
      validate(validForm({ why_bots: 'a'.repeat(MAX_RESPONSE_LENGTH) })).why_bots,
    ).toBeUndefined()
  })

  it('rejects more teammates than the array constraint allows', () => {
    const emails = Array.from({ length: MAX_TEAM_EMAILS + 1 }, (_, i) => `p${i}@x.co`)
    expect(
      validate(validForm({ teammate_emails: emails.join(',') })),
    ).toHaveProperty('teammate_emails')
  })
})

describe('validate — resume path', () => {
  // The path is issued by the function, never chosen by the client. Anything
  // else is either a mistake or an attempt to point at somebody else's file.
  it.each([
    '../../etc/passwd',
    'someone-elses-folder/resume.pdf',
    '11111111-1111-1111-1111-111111111111/resume.exe',
    '/resume.pdf',
  ])('rejects %s', (resume_path) => {
    expect(validate(validForm({ resume_path }))).toHaveProperty('resume_path')
  })

  it('accepts a path in the shape the function issues', () => {
    expect(
      validate(
        validForm({ resume_path: '11111111-1111-1111-1111-111111111111/resume.pdf' }),
      ).resume_path,
    ).toBeUndefined()
  })

  it('treats a missing resume as fine -- it is optional', () => {
    expect(validate(validForm()).resume_path).toBeUndefined()
  })
})

describe('splitEmails', () => {
  it('drops blanks and trims', () => {
    expect(splitEmails(' a@b.co ,, c@d.org , ')).toEqual(['a@b.co', 'c@d.org'])
  })

  it('returns an empty list for anything that is not a string', () => {
    expect(splitEmails(null)).toEqual([])
    expect(splitEmails(42)).toEqual([])
  })
})

describe('isDeadlinePassed', () => {
  it('is open the moment before the deadline', () => {
    expect(isDeadlinePassed(new Date(new Date(DEADLINE).getTime() - 1000))).toBe(false)
  })

  it('is closed the moment after', () => {
    expect(isDeadlinePassed(new Date(new Date(DEADLINE).getTime() + 1000))).toBe(true)
  })
})

describe('toRow', () => {
  it('never lets the client choose its own status or timestamp', () => {
    const row = toRow(
      validForm({ status: 'admitted', submitted_at: '2020-01-01T00:00:00Z' }),
      new Date('2026-09-01T12:00:00Z'),
    )
    expect(row.status).toBe('submitted')
    expect(row.submitted_at).toBe('2026-09-01T12:00:00.000Z')
  })

  it('carries no user_id -- the row belongs to an address, not an account', () => {
    expect(toRow(validForm())).not.toHaveProperty('user_id')
  })

  it('lowercases the email to match applications_email_uniq', () => {
    expect(toRow(validForm({ email: 'Ada@Example.COM' })).email).toBe('ada@example.com')
  })
})
