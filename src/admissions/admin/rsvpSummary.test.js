import { describe, it, expect } from 'vitest';
import { summarizeRsvps } from './rsvpSummary';

const row = (status, rsvp_status = 'pending', checked_in_at = null) => ({ status, rsvp_status, checked_in_at });

describe('summarizeRsvps', () => {
  it('counts only admitted applications', () => {
    const out = summarizeRsvps([
      row('admitted'),
      row('admitted', 'attending'),
      row('admitted', 'attending', '2026-09-12T13:00:00Z'),
      row('admitted', 'declined'),
      row('waitlisted'),
      row('submitted'),
    ]);
    expect(out).toEqual({ admitted: 4, attending: 2, declined: 1, pending: 1, checkedIn: 1 });
  });

  it('is all zeros for an empty list', () => {
    expect(summarizeRsvps([])).toEqual({ admitted: 0, attending: 0, declined: 0, pending: 0, checkedIn: 0 });
  });
});
