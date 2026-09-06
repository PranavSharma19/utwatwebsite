// Pure helpers for the door. Mirrors extractStatusToken in
// supabase/functions/admin-applications/checkin.ts; the server re-parses
// whatever this sends, so a mismatch here costs a red screen, not a bad row.

const UUID_RE_G = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

/**
 * A scan yields whatever the QR encoded -- the status URL -- and a typed
 * fallback yields a bare token. Both carry exactly one uuid; take the first
 * match so a query string appended after it (a tracking param, say) cannot
 * override the real token. Mirrors extractStatusToken in checkin.ts.
 */
export function parseScannedToken(text) {
  if (typeof text !== 'string') return null;
  const matches = text.trim().match(UUID_RE_G);
  return matches ? matches[0].toLowerCase() : null;
}

const time = (value) =>
  new Intl.DateTimeFormat('en-CA', {
    timeStyle: 'short',
    timeZone: 'America/Toronto',
  }).format(new Date(value));

const fullName = (a) => [a?.first_name, a?.last_name].filter(Boolean).join(' ') || 'Unnamed';

/** result -> what the big screen says. Large, three colours, one glance. */
export function describeCheckin({ result, application }) {
  switch (result) {
    case 'checked_in':
      return {
        tone: 'green',
        title: 'Checked in',
        detail: `${fullName(application)} · ${application?.school ?? ''}`,
      };
    case 'already_checked_in':
      // application?.checked_in_at can be null here: if the update in
      // admin-applications/index.ts wins the race but the re-read that
      // follows it fails, the handler falls back to the pre-update row,
      // whose checked_in_at is still null. new Date(null) is the 1970
      // epoch, so without this guard the door would show a bogus
      // "7:00 p.m." instead of just omitting the time.
      return {
        tone: 'yellow',
        title: 'Already checked in',
        detail: application?.checked_in_at
          ? `${fullName(application)} · ${time(application.checked_in_at)}`
          : `${fullName(application)} · ${application?.school ?? ''}`,
      };
    case 'not_attending':
      return {
        tone: 'red',
        title: 'Not attending',
        detail: `${fullName(application)} has no attending RSVP. Send them to the desk.`,
      };
    default:
      return {
        tone: 'red',
        title: 'Unknown code',
        detail: 'Not one of ours. Try the name lookup below.',
      };
  }
}

export const TONE_CLASSES = {
  green: 'bg-emerald-500 text-white',
  yellow: 'bg-amber-400 text-black',
  red: 'bg-rose-600 text-white',
};
