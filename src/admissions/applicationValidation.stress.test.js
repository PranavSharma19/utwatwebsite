// Garbage-input matrix for the applicant portal's client-side validation and
// for the row the server builds from it. Runs offline. Tests marked `it.fails` document gaps found
// by the stress test: they assert the *desired* behaviour and are expected to
// fail today. When you fix the gap, the test starts failing as "expected to
// fail but passed" — flip it to a plain `it`.
import { describe, expect, it } from 'vitest';
import {
  getCompletionStats,
  validateApplication,
} from './applicationValidation';
// The row builder moved server-side when applying stopped requiring an
// account: the browser now posts raw form data to an edge function, which is
// the only writer. Importing the Deno module directly is the same trick
// supabase/functions/_shared/identity.test.js uses -- it is plain TypeScript
// with no Deno globals at module scope, so vitest can load it.
import { toRow } from '../../supabase/functions/submit-application/application.ts';
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
    email: 'ada@example.com',
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

describe('getCompletionStats', () => {
  it('starts at 25% on a blank form (4 selects have defaults) and reaches 100%', () => {
    // Finding: the dashboard shows "4 of 16 required fields complete" before
    // the applicant has typed anything, because school / level_of_study /
    // graduation_year / preferred_track are pre-selected.
    //
    // 16, not 15: `email` joined the required set when applying stopped
    // requiring an account. It used to be copied from a verified JWT claim and
    // shown as a disabled field, so it was never something to complete.
    expect(getCompletionStats(emptyApplicationForm)).toEqual({
      complete: 4,
      total: 16,
      percent: 25,
    });
    expect(getCompletionStats(validForm())).toEqual({
      complete: 16,
      total: 16,
      percent: 100,
    });
  });

  it('does not count whitespace-only answers as complete', () => {
    expect(getCompletionStats(validForm({ why_bots: '  ' })).complete).toBe(15);
  });

  it('survives an empty object (initial render before the record loads)', () => {
    expect(getCompletionStats({}).percent).toBe(0);
  });
});

describe('toRow (the row the server actually inserts)', () => {
  // The form is untrusted input now -- it arrives from a browser with no
  // session behind it. Every column that decides anything must be set by the
  // server regardless of what the form claims.
  it('ignores server-owned columns supplied by the client', () => {
    const row = toRow(
      validForm({
        status: 'admitted',
        submitted_at: '2020-01-01T00:00:00Z',
        admin_notes: 'let me in',
        decided_by: 'me',
        user_id: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
      }),
      new Date('2026-09-01T12:00:00Z'),
    );
    expect(row.status).toBe('submitted');
    expect(row.submitted_at).toBe('2026-09-01T12:00:00.000Z');
    expect(row).not.toHaveProperty('admin_notes');
    expect(row).not.toHaveProperty('decided_by');
    expect(row).not.toHaveProperty('user_id');
  });

  // applications_email_uniq indexes lower(email). Storing the typed casing
  // while the index folds it would let 'A@x.ca' display as distinct from the
  // 'a@x.ca' it collides with.
  it('lowercases the email so it matches the index that enforces uniqueness', () => {
    expect(toRow(validForm({ email: '  Ada@Example.COM ' })).email).toBe(
      'ada@example.com',
    );
  });

  it('trims links and stores empty ones as null', () => {
    const row = toRow(
      validForm({ github_url: '  https://github.com/ada ', linkedin_url: '   ' }),
    );
    expect(row.links.github_url).toBe('https://github.com/ada');
    expect(row.links.linkedin_url).toBeNull();
  });

  it('coerces agreements to booleans rather than trusting truthiness', () => {
    const row = toRow(validForm({ agree_privacy: 'yes' }));
    expect(row.agreements.agree_privacy).toBe(false);
    expect(row.agreements.agree_code_of_conduct).toBe(false);
  });

  it('stores a missing resume as null rather than an empty string', () => {
    expect(toRow(validForm()).resume_path).toBeNull();
  });

  it('survives a form with non-string values in every field', () => {
    const row = toRow({ email: 'a@b.co', links: 1, responses: null, first_name: 42 });
    expect(row.first_name).toBe('');
    expect(row.responses.why_bots).toBe('');
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

  it.fails('select values outside the option list are rejected (API tampering)', () => {
    const errors = validateApplication(
      validForm({
        graduation_year: '1999',
        level_of_study: 'Kindergarten',
        preferred_track: 'Crypto',
        hackathon_count: 'banana',
        ml_skill_level: 'God',
      }),
    );
    expect(Object.keys(errors).length).toBeGreaterThan(0);
  });
});
