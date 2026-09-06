import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import ApplicationStatusPage from './ApplicationStatusPage';

// jsdom has no canvas; the QR renderer is a black box here.
vi.mock('qrcode', () => ({
  default: { toCanvas: vi.fn(() => Promise.resolve()) },
}));

vi.mock('../admissions/supabaseClient', () => ({
  isSupabaseConfigured: true,
  supabase: {},
  requireSupabase: vi.fn(),
}));

const fetchApplicationStatus = vi.fn();
const submitRsvp = vi.fn();
vi.mock('../admissions/applicationService', () => ({
  fetchApplicationStatus: (...args) => fetchApplicationStatus(...args),
  submitRsvp: (...args) => submitRsvp(...args),
}));

// The waiver is a placeholder in the repo; these tests exercise the form as
// it will behave once the real text lands, plus one test of the gate itself.
let waiverPlaceholder = false;
vi.mock('../legal/legalContent', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    get participantWaiver() {
      return { ...actual.participantWaiver, placeholder: waiverPlaceholder };
    },
  };
});

const TOKEN = '11111111-1111-1111-1111-111111111111';
const FUTURE = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();
const PAST = new Date(Date.now() - 60 * 60 * 1000).toISOString();

const admitted = (overrides = {}) => ({
  status: 'admitted',
  submitted_at: '2026-09-01T12:00:00Z',
  first_name: 'Ada',
  school: 'University of Waterloo',
  preferred_track: 'Robotics',
  over_18: true,
  rsvp_status: 'pending',
  rsvp_at: null,
  dietary_restrictions: null,
  emergency_contact_name: null,
  emergency_contact_phone: null,
  roster_opt_in: false,
  checked_in_at: null,
  rsvp_deadline: FUTURE,
  ...overrides,
});

const setup = () =>
  render(
    <MemoryRouter initialEntries={[`/apply/status/${TOKEN}`]}>
      <Routes>
        <Route path="/apply/status/:token" element={<ApplicationStatusPage />} />
      </Routes>
    </MemoryRouter>,
  );

beforeEach(() => {
  fetchApplicationStatus.mockReset();
  submitRsvp.mockReset();
  waiverPlaceholder = false;
});

describe('status page before a decision', () => {
  it('shows the badge and no RSVP controls', async () => {
    fetchApplicationStatus.mockResolvedValue(admitted({ status: 'submitted', rsvp_deadline: null }));
    setup();
    // 'Submitted' is also a <dt> in the details grid; the badge is the span.
    expect(await screen.findByText('Submitted', { selector: 'span' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^yes/i })).toBeNull();
  });
});

describe('admitted, RSVP open', () => {
  it('renders the form with the deadline', async () => {
    fetchApplicationStatus.mockResolvedValue(admitted());
    setup();
    expect(await screen.findByText('Admitted')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^yes/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^no/i })).toBeInTheDocument();
    expect(screen.getByText(/rsvp by/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /participant waiver/i })).toHaveAttribute('href', '/waiver');
  });

  it('hides the details when the answer is no, and submits a decline', async () => {
    const user = userEvent.setup();
    fetchApplicationStatus.mockResolvedValue(admitted());
    submitRsvp.mockResolvedValue(admitted({ rsvp_status: 'declined', rsvp_at: PAST }));
    setup();
    await user.click(await screen.findByRole('button', { name: /^no/i }));
    expect(screen.queryByLabelText(/emergency contact name/i)).toBeNull();
    await user.click(screen.getByRole('button', { name: /send rsvp/i }));
    await waitFor(() => expect(submitRsvp).toHaveBeenCalledTimes(1));
    expect(submitRsvp.mock.calls[0][0]).toBe(TOKEN);
    expect(submitRsvp.mock.calls[0][1].attending).toBe(false);
    expect(await screen.findByText(/sorry you can.t make it/i)).toBeInTheDocument();
  });

  it('will not send a yes without the waiver and a contact', async () => {
    const user = userEvent.setup();
    fetchApplicationStatus.mockResolvedValue(admitted());
    setup();
    await user.click(await screen.findByRole('button', { name: /^yes/i }));
    await user.click(screen.getByRole('button', { name: /send rsvp/i }));
    expect(submitRsvp).not.toHaveBeenCalled();
    expect(await screen.findByText(/accept the waiver/i)).toBeInTheDocument();
  });

  it('sends a complete yes and shows the ticket', async () => {
    const user = userEvent.setup();
    fetchApplicationStatus.mockResolvedValue(admitted());
    submitRsvp.mockResolvedValue(
      admitted({
        rsvp_status: 'attending',
        rsvp_at: PAST,
        emergency_contact_name: 'Byron',
        emergency_contact_phone: '6475550100',
      }),
    );
    setup();
    await user.click(await screen.findByRole('button', { name: /^yes/i }));
    await user.type(screen.getByLabelText(/emergency contact name/i), 'Byron');
    await user.type(screen.getByLabelText(/emergency contact phone/i), '647 555 0100');
    await user.click(screen.getByLabelText(/i have read and agree/i));
    await user.click(screen.getByLabelText(/show my first name/i));
    await user.click(screen.getByRole('button', { name: /send rsvp/i }));

    await waitFor(() => expect(submitRsvp).toHaveBeenCalledTimes(1));
    const form = submitRsvp.mock.calls[0][1];
    expect(form).toMatchObject({
      attending: true,
      emergency_contact_name: 'Byron',
      waiver_accepted: true,
      roster_opt_in: true,
    });
    expect(await screen.findByText(/show this at the door/i)).toBeInTheDocument();
    expect(screen.getByText('Attending')).toBeInTheDocument();
  });

  it('puts a server field rejection back on the field', async () => {
    const user = userEvent.setup();
    fetchApplicationStatus.mockResolvedValue(admitted());
    const error = new Error('Please fix the highlighted fields.');
    error.fieldErrors = { emergency_contact_phone: 'Enter a phone number with at least 7 digits.' };
    submitRsvp.mockRejectedValue(error);
    setup();
    await user.click(await screen.findByRole('button', { name: /^yes/i }));
    await user.type(screen.getByLabelText(/emergency contact name/i), 'Byron');
    await user.type(screen.getByLabelText(/emergency contact phone/i), '647 555 0100');
    await user.click(screen.getByLabelText(/i have read and agree/i));
    await user.click(screen.getByRole('button', { name: /send rsvp/i }));
    expect(await screen.findByText(/at least 7 digits/i)).toBeInTheDocument();
  });

  it('explains a closed window returned by the server', async () => {
    const user = userEvent.setup();
    fetchApplicationStatus.mockResolvedValue(admitted());
    submitRsvp.mockRejectedValue(new Error('rsvp closed'));
    setup();
    await user.click(await screen.findByRole('button', { name: /^no/i }));
    await user.click(screen.getByRole('button', { name: /send rsvp/i }));
    expect(await screen.findByText(/rsvps have closed/i)).toBeInTheDocument();
  });
});

describe('admitted, other states', () => {
  it('holds the form while the waiver is a placeholder', async () => {
    waiverPlaceholder = true;
    fetchApplicationStatus.mockResolvedValue(admitted());
    setup();
    expect(await screen.findByText(/rsvp opens shortly/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^yes/i })).toBeNull();
  });

  it('turns an under-18 away with the contact address', async () => {
    fetchApplicationStatus.mockResolvedValue(admitted({ over_18: false }));
    setup();
    expect(await screen.findByText(/18\+/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^yes/i })).toBeNull();
  });

  it('says RSVPs closed once the deadline has passed', async () => {
    fetchApplicationStatus.mockResolvedValue(admitted({ rsvp_deadline: PAST }));
    setup();
    expect(await screen.findByText(/rsvps closed/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^yes/i })).toBeNull();
  });

  it('shows the ticket to someone attending, and marks it once checked in', async () => {
    fetchApplicationStatus.mockResolvedValue(
      admitted({ rsvp_status: 'attending', rsvp_at: PAST, checked_in_at: '2026-09-12T13:05:00Z' }),
    );
    setup();
    expect(await screen.findByText('Checked In')).toBeInTheDocument();
    expect(screen.getByText(/show this at the door/i)).toBeInTheDocument();
  });
});
