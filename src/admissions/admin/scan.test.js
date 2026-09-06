import { describe, it, expect } from 'vitest';
import { describeCheckin, parseScannedToken } from './scan';

const TOKEN = '11111111-1111-1111-1111-111111111111';

describe('parseScannedToken', () => {
  it('reads a token out of the URL the ticket encodes', () => {
    expect(parseScannedToken(`https://utwat.ca/apply/status/${TOKEN}`)).toBe(TOKEN);
  });
  it('accepts a bare token and rejects noise', () => {
    expect(parseScannedToken(TOKEN.toUpperCase())).toBe(TOKEN);
    expect(parseScannedToken('WIFI:S:hackathon;;')).toBeNull();
    expect(parseScannedToken('')).toBeNull();
  });
});

describe('describeCheckin', () => {
  const ada = { first_name: 'Ada', last_name: 'Lovelace', school: 'University of Waterloo', checked_in_at: null };

  it('is green for a fresh check-in, naming the person', () => {
    const out = describeCheckin({ result: 'checked_in', application: ada });
    expect(out.tone).toBe('green');
    expect(out.title).toMatch(/checked in/i);
    expect(out.detail).toContain('Ada Lovelace');
  });

  it('is yellow with the time for a repeat', () => {
    const out = describeCheckin({
      result: 'already_checked_in',
      application: { ...ada, checked_in_at: '2026-09-12T13:05:00Z' },
    });
    expect(out.tone).toBe('yellow');
    expect(out.title).toMatch(/already/i);
    expect(out.detail).toMatch(/9:05/);
  });

  // Lost-race fallback (admin-applications/index.ts): the update wins but the
  // re-read fails, so checked_in_at comes back null on an otherwise valid
  // application. Must not render the 1970 epoch as a real check-in time.
  it('omits the time rather than showing the epoch when checked_in_at is null', () => {
    const out = describeCheckin({
      result: 'already_checked_in',
      application: { ...ada, checked_in_at: null },
    });
    expect(out.tone).toBe('yellow');
    expect(out.detail).toContain('Ada Lovelace');
    expect(out.detail).not.toMatch(/1969|1970/);
  });

  it('does not throw when application itself is missing', () => {
    expect(() => describeCheckin({ result: 'already_checked_in', application: null })).not.toThrow();
  });

  it('is red for someone not attending, and for an unknown code', () => {
    expect(describeCheckin({ result: 'not_attending', application: ada }).tone).toBe('red');
    expect(describeCheckin({ result: 'not_attending', application: ada }).title).toMatch(/not attending/i);
    const unknown = describeCheckin({ result: 'not_found', application: null });
    expect(unknown.tone).toBe('red');
    expect(unknown.title).toMatch(/unknown/i);
  });
});
