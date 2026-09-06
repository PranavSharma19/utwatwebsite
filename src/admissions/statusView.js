import { participantWaiver } from '../legal/legalContent';

/**
 * Which panel the status page shows. One function so the ordering is in one
 * place: an answer already given beats every other consideration, age beats
 * deadline (an under-18 is told why, not "closed"), and the waiver gate only
 * matters once the form would otherwise open.
 */
export function deriveStatusView(
  application,
  now = new Date(),
  waiverReady = !participantWaiver.placeholder,
) {
  if (!application || application.status !== 'admitted') return 'plain';
  if (application.checked_in_at) return 'checked-in';
  if (application.rsvp_status === 'attending') return 'attending';
  if (application.rsvp_status === 'declined') return 'declined';
  if (application.over_18 !== true) return 'underage';
  if (application.rsvp_deadline && now > new Date(application.rsvp_deadline)) {
    return 'rsvp-closed';
  }
  if (!waiverReady) return 'rsvp-waiting';
  return 'rsvp-open';
}

/** Server error codes from the rsvp action, as sentences. */
export const RSVP_ERROR_COPY = {
  'rsvp closed': 'RSVPs have closed. If you think this is a mistake, email us.',
  'already responded': 'We already have your RSVP. Reload this page to see it.',
  underage: 'The event is 18+, so we cannot take an RSVP for this application.',
  'not admitted': 'This application has not been admitted.',
  'not found': 'That link does not match an application.',
};
