// Garbage-input matrix for the applicant portal's client-side validation and
// payload builders. Runs offline. Tests marked `it.fails` document gaps found
// by the stress test: they assert the *desired* behaviour and are expected to
// fail today. When you fix the gap, the test starts failing as "expected to
// fail but passed" — flip it to a plain `it`.
import { describe, expect, it } from 'vitest';
import {
  getCompletionStats,
  validateApplication,
} from './applicationValidation';
import {
  applicationRecordToForm,
  formToApplicationPayload,
} from './applicationService';
import {
  emptyApplicationForm,
  portalConfig,
  requiredApplicationBooleans,
  requiredApplicationFields,
} from './portalConfig';

function validForm(overrides = {}) {
  return {
    ...emptyApplicationForm,
    first_name: 'Ada',
    last_name: 'Lovelace',
    phone: '+1 647 555 0100',
    program: 'Computer Science',
    why_bots: 'Because.',
    project_story: 'A project.',
    future_build: 'Everything.',
    over_18: true,
    can_attend_in_person: true,
    agree_privacy: true,
    agree_accuracy: true,
    ...overrides,
  };
}

describe('validateApplication — happy path', () => {
  it('accepts a fully valid form', () => {
    expect(validateApplication(validForm())).toEqual({});
  });

  it('accepts every configured school, level, year, and track', () => {
    for (const school of portalConfig.allowedSchools) {
      expect(validateApplication(validForm({ school }))).toEqual({});
    }
  });
});

describe('validateApplication — required fields', () => {
  it.each(requiredApplicationFields)('flags empty %s', (field) => {
    expect(validateApplication(validForm({ [field]: '' }))[field]).toBeDefined();
  });

  it.each(requiredApplicationFields)('flags whitespace-only %s', (field) => {
    expect(
      validateApplication(validForm({ [field]: '   \n\t ' }))[field],
    ).toBeDefined();
  });

  it.each(requiredApplicationBooleans)('flags unchecked %s', (field) => {
    expect(validateApplication(validForm({ [field]: false }))[field]).toBe(
      'This confirmation is required.',
    );
  });

  it.each(requiredApplicationBooleans)(
    'rejects truthy-but-not-true %s (string "true", 1)',
    (field) => {
      expect(validateApplication(validForm({ [field]: 'true' }))[field]).toBeDefined();
      expect(validateApplication(validForm({ [field]: 1 }))[field]).toBeDefined();
    },
  );

  it('flags a school that is not in the allowlist (select tampering)', () => {
    expect(validateApplication(validForm({ school: 'MIT' })).school).toMatch(
      /selected schools/,
    );
  });
});

describe('validateApplication — links', () => {
  const urlFields = ['github_url', 'linkedin_url', 'portfolio_url', 'devpost_url'];

  it.each(urlFields)('%s accepts empty and valid https', (field) => {
    expect(validateApplication(validForm({ [field]: '' }))[field]).toBeUndefined();
    expect(
      validateApplication(validForm({ [field]: 'https://github.com/ada' }))[field],
    ).toBeUndefined();
    expect(
      validateApplication(validForm({ [field]: 'http://example.com' }))[field],
    ).toBeUndefined();
  });

  it.each([
    'github.com/ada', // what most people type
    'www.linkedin.com/in/ada',
    'ftp://example.com',
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'https://', // scheme only
    'https:// github.com', // interior space
    'not a url',
  ])('rejects %j', (value) => {
    expect(validateApplication(validForm({ github_url: value })).github_url).toMatch(
      /full URL/,
    );
  });

  it('tolerates leading/trailing whitespace around a valid URL', () => {
    expect(
      validateApplication(validForm({ github_url: '  https://github.com/ada  ' }))
        .github_url,
    ).toBeUndefined();
  });
});

describe('validateApplication — teammate emails', () => {
  it.each([
    '',
    'a@b.co',
    'a@b.co, c@d.org',
    'a@b.co,,, c@d.org,',
    '  a@b.co  ,  c@d.org  ',
  ])('accepts %j', (value) => {
    expect(
      validateApplication(validForm({ teammate_emails: value })).teammate_emails,
    ).toBeUndefined();
  });

  it.each([
    'a@b', // no TLD
    'a@b.co c@d.org', // space-separated instead of commas
    'a@b.co; c@d.org', // semicolons
    'not-an-email',
    'a@@b.co',
  ])('rejects %j', (value) => {
    expect(
      validateApplication(validForm({ teammate_emails: value })).teammate_emails,
    ).toMatch(/separated by commas/);
  });
});

describe('getCompletionStats', () => {
  it('starts at 27% on a blank form (4 selects have defaults) and reaches 100%', () => {
    // Finding: the dashboard shows "4 of 15 required fields complete" before
    // the applicant has typed anything, because school / level_of_study /
    // graduation_year / preferred_track are pre-selected.
    expect(getCompletionStats(emptyApplicationForm)).toEqual({
      complete: 4,
      total: 15,
      percent: 27,
    });
    expect(getCompletionStats(validForm())).toEqual({
      complete: 15,
      total: 15,
      percent: 100,
    });
  });

  it('does not count whitespace-only answers as complete', () => {
    expect(getCompletionStats(validForm({ why_bots: '  ' })).complete).toBe(14);
  });

  it('survives an empty object (initial render before the record loads)', () => {
    expect(getCompletionStats({}).percent).toBe(0);
  });
});

describe('formToApplicationPayload', () => {
  it('never includes server-owned columns', () => {
    const payload = formToApplicationPayload(validForm());
    for (const key of [
      'user_id',
      'email',
      'status',
      'submitted_at',
      'admin_notes',
      'decided_at',
      'decided_by',
      'updated_at',
      'resume_path',
    ]) {
      expect(payload).not.toHaveProperty(key);
    }
  });

  it('trims links and stores empty ones as null', () => {
    const payload = formToApplicationPayload(
      validForm({ github_url: '  https://github.com/ada ', linkedin_url: '   ' }),
    );
    expect(payload.links.github_url).toBe('https://github.com/ada');
    expect(payload.links.linkedin_url).toBeNull();
  });

  it('splits teammate emails on commas and drops blanks', () => {
    expect(
      formToApplicationPayload(validForm({ teammate_emails: ' a@b.co ,, c@d.org , ' }))
        .team_emails,
    ).toEqual(['a@b.co', 'c@d.org']);
  });

  it('coerces agreements to booleans', () => {
    const payload = formToApplicationPayload(validForm({ agree_privacy: 'yes' }));
    expect(payload.agreements.agree_privacy).toBe(true);
    expect(payload.agreements.agree_code_of_conduct).toBe(false);
  });

  it('round-trips through applicationRecordToForm', () => {
    const form = validForm({
      github_url: 'https://github.com/ada',
      teammate_emails: 'a@b.co, c@d.org',
      joke: 'why',
    });
    const record = { ...formToApplicationPayload(form), id: 'x' };
    expect(applicationRecordToForm(record)).toEqual(form);
  });

  it('applicationRecordToForm tolerates a record with null jsonb / arrays', () => {
    const form = applicationRecordToForm({
      id: 'x',
      links: null,
      responses: null,
      agreements: null,
      team_emails: null,
    });
    expect(form.github_url).toBe('');
    expect(form.teammate_emails).toBe('');
    expect(form.agree_privacy).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Gaps. Each of these describes input a real applicant will produce that the
// client accepts today but the database (or common sense) rejects. Because the
// client does not catch it, the applicant sees a raw Postgres error such as
// `new row for relation "applications" violates check constraint
// "applications_first_name_len"` instead of a highlighted field.
// ---------------------------------------------------------------------------
describe('known gaps (expected to fail until fixed)', () => {
  it.fails('phone must contain digits', () => {
    expect(validateApplication(validForm({ phone: 'hello' })).phone).toBeDefined();
  });

  it.fails('phone typed into the name field is flagged', () => {
    expect(
      validateApplication(validForm({ first_name: '6475550100' })).first_name,
    ).toBeDefined();
  });

  it.fails('first_name over the 200-char DB limit is flagged client-side', () => {
    expect(
      validateApplication(validForm({ first_name: 'a'.repeat(201) })).first_name,
    ).toBeDefined();
  });

  it.fails('phone over the 50-char DB limit is flagged client-side', () => {
    expect(validateApplication(validForm({ phone: '1'.repeat(51) })).phone).toBeDefined();
  });

  it.fails('program over the 300-char DB limit is flagged client-side', () => {
    expect(
      validateApplication(validForm({ program: 'a'.repeat(301) })).program,
    ).toBeDefined();
  });

  it.fails('essays whose combined JSON exceeds the 20 000-char DB limit are flagged', () => {
    const errors = validateApplication(
      validForm({
        why_bots: 'a'.repeat(7000),
        project_story: 'a'.repeat(7000),
        future_build: 'a'.repeat(7000),
      }),
    );
    expect(Object.keys(errors).length).toBeGreaterThan(0);
  });

  it.fails('more than 20 teammate emails (DB cardinality cap) is flagged', () => {
    const many = Array.from({ length: 21 }, (_, i) => `t${i}@x.co`).join(', ');
    expect(
      validateApplication(validForm({ teammate_emails: many })).teammate_emails,
    ).toBeDefined();
  });

  it.fails('select values outside the option list are rejected (API tampering)', () => {
    const errors = validateApplication(
      validForm({
        graduation_year: '1999',
        level_of_study: 'Kindergarten',
        preferred_track: 'Crypto',
        hackathon_count: 'banana',
        ml_skill_level: 'God',
        team_intent: 'whatever',
      }),
    );
    expect(Object.keys(errors).length).toBeGreaterThan(0);
  });

  it.fails('the applicant cannot list their own email as a teammate', () => {
    const errors = validateApplication(
      validForm({ teammate_emails: 'me@school.edu' }),
      { email: 'me@school.edu' },
    );
    expect(errors.teammate_emails).toBeDefined();
  });
});
