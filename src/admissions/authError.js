/**
 * Reads the failure GoTrue reports back in the URL fragment after a magic
 * link is opened.
 *
 * This has to be *captured*, not merely read on demand. supabase-js runs
 * `_getSessionFromURL` during client initialisation; when it finds error
 * params it throws and then calls `history.replaceState` to strip the hash
 * (auth-js GoTrueClient, `clearing window.location.hash`). That happens on a
 * promise, so a component that reads `window.location.hash` after mount is
 * racing a cleanup that usually wins. `captureAuthError()` is therefore called
 * once, synchronously, before React renders.
 *
 * Without this the visitor lands on a page that looks completely normal with
 * `#error=access_denied&error_code=otp_expired...` in the address bar and no
 * explanation anywhere on it.
 */

/**
 * @param {string} hash  a location fragment, with or without the leading '#'
 * @returns {{code: string, description: string} | null}
 */
export function parseAuthError(hash) {
  if (typeof hash !== 'string') return null;
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  if (!raw) return null;

  const params = new URLSearchParams(raw);
  // `error_code` is the machine-readable one; `error` is the OAuth-level
  // bucket ("access_denied") and is all we get for some failures.
  const code = params.get('error_code') || params.get('error');
  if (!code) return null;

  return {
    code,
    // Percent- and plus-decoded by URLSearchParams already.
    description: params.get('error_description') || '',
  };
}

/**
 * Turn a GoTrue error into something a human can act on.
 *
 * `otp_expired` is deliberately not phrased as "expired" alone. GoTrue returns
 * that same code for *any* token it won't accept -- verified by handing the
 * verify endpoint a string that was never a token and getting
 * `error_code=otp_expired` back. Already-opened links and links that were
 * never valid both land here, so the copy has to cover all of it.
 *
 * @returns {{title: string, detail: string}}
 */
export function describeAuthError({ code, description } = {}) {
  switch (code) {
    case 'otp_expired':
      return {
        title: 'That sign-in link no longer works',
        detail:
          'Sign-in links can only be opened once, and they expire after a while. This one had already been used or was too old. Enter your email below and we will send a fresh one.',
      };
    case 'access_denied':
      return {
        title: 'That sign-in link was rejected',
        detail:
          'The link could not be verified. Enter your email below to get a new one.',
      };
    case 'server_error':
    case 'unexpected_failure':
      return {
        title: 'Sign-in is temporarily unavailable',
        detail:
          'Something went wrong on our side, not yours. Please try again in a moment.',
      };
    default:
      return {
        title: 'Sign-in did not complete',
        detail:
          description ||
          'The sign-in link could not be used. Enter your email below to get a new one.',
      };
  }
}

let captured = null;

/**
 * Snapshot the fragment before supabase-js erases it. Safe to call more than
 * once; only a fragment that actually carries an error replaces what is held,
 * so a second call after the hash is gone cannot wipe a real capture.
 */
export function captureAuthError(location = globalThis.location) {
  const found = parseAuthError(location?.hash ?? '');
  if (found) captured = found;
  return captured;
}

export function getCapturedAuthError() {
  return captured;
}

/** Once it has been shown, it should not reappear on the next navigation. */
export function clearCapturedAuthError() {
  captured = null;
}

/**
 * Where a failed sign-in should be shown.
 *
 * Supabase falls back to the project's Site URL when a link's `redirect_to`
 * is not on its allow list, and the Site URL is the landing page -- so a dead
 * link can drop someone on the homepage with the failure sitting unexplained
 * in the address bar. Only `/apply` renders the notice, so send them there.
 * Any path that already handles it is left alone.
 *
 * @returns {string | null} a path to forward to, or null to stay put
 */
export function authErrorLanding(pathname, error) {
  if (!error) return null;
  return pathname === '/' ? '/apply' : null;
}
