import { describe, it, expect } from 'vitest';
import { participantWaiver } from '../legal/legalContent';
import { deriveStatusView } from './statusView';

const DEADLINE = '2026-09-11T03:59:00.000Z';
const before = new Date('2026-09-09T12:00:00Z');
const after = new Date('2026-09-11T12:00:00Z');

const admitted = (overrides = {}) => ({
  status: 'admitted',
  over_18: true,
  rsvp_status: 'pending',
  checked_in_at: null,
  rsvp_deadline: DEADLINE,
  ...overrides,
});

describe('deriveStatusView', () => {
  it('is plain for anything not admitted, and for a missing application', () => {
    expect(deriveStatusView(null)).toBe('plain');
    for (const status of ['incomplete', 'submitted', 'waitlisted', 'rejected']) {
      expect(deriveStatusView(admitted({ status }), before, true)).toBe('plain');
    }
  });

  it('opens the form for an admitted adult before their deadline', () => {
    expect(deriveStatusView(admitted(), before, true)).toBe('rsvp-open');
  });

  // The waiver gate. Nothing about the applicant changed; the site is not
  // ready to take their acceptance yet.
  it('holds the form while the waiver is still a placeholder', () => {
    expect(deriveStatusView(admitted(), before, false)).toBe('rsvp-waiting');
  });

  it('closes after the deadline the server handed back', () => {
    expect(deriveStatusView(admitted(), after, true)).toBe('rsvp-closed');
  });

  it('turns under-18s away before looking at the deadline', () => {
    expect(deriveStatusView(admitted({ over_18: false }), after, true)).toBe('underage');
  });

  it('shows the answer once one is given, regardless of deadline', () => {
    expect(deriveStatusView(admitted({ rsvp_status: 'declined' }), after, true)).toBe('declined');
    expect(deriveStatusView(admitted({ rsvp_status: 'attending' }), after, true)).toBe('attending');
  });

  it('shows checked-in over attending', () => {
    expect(
      deriveStatusView(admitted({ rsvp_status: 'attending', checked_in_at: '2026-09-12T13:00:00Z' }), after, true),
    ).toBe('checked-in');
  });

  it('reads the waiver flag by default', () => {
    // Pins the wiring, not the flag's current value: calling without the
    // third argument must agree with passing !participantWaiver.placeholder
    // explicitly, so flipping the waiver live (or back) needs no test edit.
    // The two branches themselves are covered by the explicit-true and
    // explicit-false cases above.
    expect(deriveStatusView(admitted(), before)).toBe(
      deriveStatusView(admitted(), before, !participantWaiver.placeholder),
    );
    expect(deriveStatusView(admitted(), before)).toBe(
      participantWaiver.placeholder ? 'rsvp-waiting' : 'rsvp-open',
    );
  });
});
