import { describe, it, expect, beforeEach } from 'vitest';
import {
  parseAuthError,
  describeAuthError,
  captureAuthError,
  getCapturedAuthError,
  clearCapturedAuthError,
  authErrorLanding,
} from './authError';

// The exact fragment a real expired magic link produced in production.
const REAL =
  '#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired&sb=';

describe('parseAuthError', () => {
  it('reads the code and description from a real failure fragment', () => {
    expect(parseAuthError(REAL)).toEqual({
      code: 'otp_expired',
      description: 'Email link is invalid or has expired',
    });
  });

  it('decodes + as a space, the way GoTrue encodes it', () => {
    expect(parseAuthError(REAL).description).not.toContain('+');
  });

  it('works with or without the leading hash', () => {
    expect(parseAuthError(REAL.slice(1))).toEqual(parseAuthError(REAL));
  });

  it('prefers error_code over the broader error bucket', () => {
    expect(parseAuthError('#error=access_denied&error_code=otp_expired').code).toBe(
      'otp_expired',
    );
  });

  it('still reports something when only the bucket is present', () => {
    expect(parseAuthError('#error=access_denied').code).toBe('access_denied');
  });

  it('is null for fragments that carry no error', () => {
    expect(parseAuthError('')).toBeNull();
    expect(parseAuthError('#')).toBeNull();
    expect(parseAuthError('#access_token=abc&type=magiclink')).toBeNull();
    expect(parseAuthError(undefined)).toBeNull();
  });
});

describe('describeAuthError', () => {
  // GoTrue returns otp_expired for tokens that were never valid too, so the
  // wording must not promise the visitor that it merely timed out.
  it('covers "already used" as well as "too old" for otp_expired', () => {
    const { detail } = describeAuthError({ code: 'otp_expired' });
    expect(detail).toMatch(/already been used/i);
    expect(detail).toMatch(/expire/i);
  });

  it('always tells the visitor what to do next', () => {
    for (const code of ['otp_expired', 'access_denied', 'server_error', 'weird_new_code']) {
      const { title, detail } = describeAuthError({ code });
      expect(title.length).toBeGreaterThan(0);
      expect(detail.length).toBeGreaterThan(0);
    }
  });

  it('does not blame the visitor for a server fault', () => {
    expect(describeAuthError({ code: 'server_error' }).detail).toMatch(/not yours/i);
  });

  it('falls back to the server description for unknown codes', () => {
    expect(describeAuthError({ code: 'nope', description: 'Custom text' }).detail).toBe(
      'Custom text',
    );
  });
});

describe('captureAuthError', () => {
  beforeEach(() => clearCapturedAuthError());

  it('captures from a location-like object', () => {
    captureAuthError({ hash: REAL });
    expect(getCapturedAuthError().code).toBe('otp_expired');
  });

  /**
   * The whole reason this module exists: supabase-js strips the fragment
   * during init. A later call must not erase what was captured first.
   */
  it('survives a later call once supabase-js has wiped the hash', () => {
    captureAuthError({ hash: REAL });
    captureAuthError({ hash: '' });
    expect(getCapturedAuthError().code).toBe('otp_expired');
  });

  it('holds nothing on a clean load', () => {
    captureAuthError({ hash: '' });
    expect(getCapturedAuthError()).toBeNull();
  });

  it('can be cleared so it does not resurface later', () => {
    captureAuthError({ hash: REAL });
    clearCapturedAuthError();
    expect(getCapturedAuthError()).toBeNull();
  });
});

describe('authErrorLanding', () => {
  const err = { code: 'otp_expired', description: '' };

  // Supabase's Site URL fallback drops dead links on the landing page, which
  // has nothing that can explain what went wrong.
  it('forwards a failure that landed on the homepage to /apply', () => {
    expect(authErrorLanding('/', err)).toBe('/apply');
  });

  it('leaves a failure that already reached /apply alone', () => {
    expect(authErrorLanding('/apply', err)).toBeNull();
    expect(authErrorLanding('/apply/admin', err)).toBeNull();
  });

  it('never redirects an ordinary visit to the homepage', () => {
    expect(authErrorLanding('/', null)).toBeNull();
    expect(authErrorLanding('/', undefined)).toBeNull();
  });
});
