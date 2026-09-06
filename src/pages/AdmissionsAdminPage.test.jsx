import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApplicationDetail } from './AdmissionsAdminPage';

// The only assertion this file exists for: the reset control is a two-step
// confirm, and the first click must not touch onUpdate. A refactor that
// collapses the two steps into one would turn a misclick into a wiped
// waiver record with no confirmation, and nothing else in the suite would
// notice -- see the review that asked for this test.
const application = {
  id: 'app-1',
  status: 'admitted',
  first_name: 'Ada',
  last_name: 'Lovelace',
  email: 'ada@uwaterloo.ca',
  school: 'University of Waterloo',
  program: 'CS',
  preferred_track: 'Robotics',
  submitted_at: '2026-09-01T12:00:00Z',
  admin_notes: '',
  rsvp_status: 'attending',
  rsvp_at: '2026-09-05T12:00:00Z',
  waiver_accepted_at: '2026-09-05T12:00:00Z',
  waiver_version: '2026-09-08',
  emergency_contact_name: 'Bea',
  emergency_contact_phone: '6475550100',
  dietary_restrictions: null,
  roster_opt_in: false,
  checked_in_at: null,
  checked_in_by: null,
  links: {},
  responses: {},
};

const setup = (onUpdate = vi.fn()) => {
  render(
    <ApplicationDetail
      application={application}
      onClose={vi.fn()}
      onOpenResume={vi.fn()}
      onUpdate={onUpdate}
      updating={false}
    />,
  );
  return onUpdate;
};

describe('ApplicationDetail reset RSVP', () => {
  it('requires two clicks, and the first does not call onUpdate', async () => {
    const user = userEvent.setup();
    const onUpdate = setup();

    await user.click(screen.getByRole('button', { name: /reset rsvp/i }));
    expect(onUpdate).not.toHaveBeenCalled();

    await user.click(
      screen.getByRole('button', { name: /confirm reset/i }),
    );
    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(onUpdate).toHaveBeenCalledWith('app-1', { rsvp_reset: true });
  });
});
