import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AuthPanel from './AuthPanel';
import { captureAuthError, clearCapturedAuthError } from './authError';

/**
 * The real widget calls out to Cloudflare and never resolves under jsdom, so
 * the submit button would stay disabled forever. This stands in for a visitor
 * who has already passed the challenge.
 */
vi.mock('@marsidev/react-turnstile', async () => {
  const { useEffect } = await import('react');
  return {
    // Resolving inside an effect keeps the state update within React's
    // rendering pass, so tests do not have to wrap it in act().
    Turnstile: ({ onSuccess }) => {
      useEffect(() => onSuccess('test-captcha-token'), [onSuccess]);
      return <div data-testid="turnstile-stub" />;
    },
  };
});

// Nothing here should reach the network; the notice is decided before any
// request is made.
vi.mock('./supabaseClient', () => ({
  isSupabaseConfigured: true,
  supabase: { auth: { signInWithOtp: vi.fn(async () => ({ error: null })) } },
  requireSupabase: vi.fn(),
}));

const DEAD_LINK =
  '#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired&sb=';

describe('AuthPanel magic-link failure notice', () => {
  beforeEach(() => clearCapturedAuthError());

  it('shows nothing on an ordinary visit', () => {
    render(<AuthPanel />);
    expect(screen.queryByTestId('auth-link-failure')).toBeNull();
  });

  /**
   * The bug this covers: the visitor was bounced here from a dead link with
   * the reason only ever present in the URL fragment, which supabase-js then
   * deleted. The page rendered as a normal sign-in prompt and said nothing.
   */
  it('explains a dead link, and says what to do about it', () => {
    captureAuthError({ hash: DEAD_LINK });
    render(<AuthPanel />);
    const notice = screen.getByTestId('auth-link-failure');
    expect(notice).toHaveTextContent(/no longer works/i);
    expect(notice).toHaveTextContent(/send a fresh one/i);
  });

  it('announces itself to assistive technology', () => {
    captureAuthError({ hash: DEAD_LINK });
    render(<AuthPanel />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  // Leaving a stale failure on screen while a new link is being sent reads as
  // though the new attempt failed too.
  it('retires the notice once a new link is requested', async () => {
    const user = userEvent.setup();
    captureAuthError({ hash: DEAD_LINK });
    render(<AuthPanel />);
    expect(screen.getByTestId('auth-link-failure')).toBeInTheDocument();

    await user.type(screen.getByLabelText(/email address/i), 'a@uwaterloo.ca');
    await user.click(screen.getByRole('button', { name: /send|link/i }));

    expect(screen.queryByTestId('auth-link-failure')).toBeNull();
  });
});
