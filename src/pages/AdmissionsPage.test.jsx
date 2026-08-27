import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import AdmissionsPage from './AdmissionsPage';
import { emptyApplicationForm } from '../admissions/portalConfig';
import { saveDraft } from '../admissions/draftStorage';

vi.mock('@marsidev/react-turnstile', async () => {
  const { useEffect } = await import('react');
  return {
    Turnstile: ({ onSuccess }) => {
      useEffect(() => onSuccess('test-captcha-token'), [onSuccess]);
      return <div data-testid="turnstile-stub" />;
    },
  };
});

vi.mock('../admissions/supabaseClient', () => ({
  isSupabaseConfigured: true,
  supabase: {},
  requireSupabase: vi.fn(),
}));

const submitApplication = vi.fn();
const uploadResume = vi.fn();

vi.mock('../admissions/applicationService', () => ({
  submitApplication: (...args) => submitApplication(...args),
  uploadResume: (...args) => uploadResume(...args),
}));

const setup = () =>
  render(
    <MemoryRouter>
      <AdmissionsPage />
    </MemoryRouter>,
  );

/** A complete application, as an applicant would leave the form. */
function completeDraft(overrides = {}) {
  return {
    ...emptyApplicationForm,
    first_name: 'Ada',
    last_name: 'Lovelace',
    email: 'ada@uwaterloo.ca',
    phone: '+1 647 555 0100',
    program: 'Computer Science',
    why_bots: 'Because.',
    project_story: 'A project.',
    future_build: 'A future.',
    over_18: true,
    can_attend_in_person: true,
    agree_privacy: true,
    agree_accuracy: true,
    ...overrides,
  };
}

beforeEach(() => {
  window.localStorage.clear();
  submitApplication.mockReset();
  uploadResume.mockReset();
  window.scrollTo = vi.fn();
});

/**
 * The whole point of the change these cover: applying used to require
 * receiving a magic link, and neither school's mail system would reliably
 * deliver one. If a sign-in step ever creeps back in front of this form, every
 * applicant at both host universities is blocked again -- and the failure is
 * invisible from here, because it happens in somebody else's mail filter.
 */
describe('applying without an account', () => {
  it('shows the form immediately, with no sign-in step', () => {
    setup();
    expect(screen.getByRole('button', { name: /submit application/i })).toBeInTheDocument();
    // The AuthPanel's control, not its prose -- the page copy legitimately
    // mentions sign-in links in order to say there are none.
    expect(screen.queryByRole('button', { name: /send.*link|magic link/i })).toBeNull();
    expect(screen.queryByLabelText(/email address/i)).toBeNull();
  });

  it('asks the applicant for their own email rather than reading it from a session', () => {
    setup();
    const email = screen.getByLabelText(/^email/i);
    expect(email).toBeEnabled();
    expect(email).toHaveValue('');
  });

  it('never renders a sign-out control -- there is no session to end', () => {
    setup();
    expect(screen.queryByRole('button', { name: /sign out/i })).toBeNull();
  });
});

describe('draft persistence', () => {
  it('restores a draft left in this browser', () => {
    saveDraft(completeDraft(), '');
    setup();
    expect(screen.getByLabelText(/first name/i)).toHaveValue('Ada');
    expect(screen.getByLabelText(/^email/i)).toHaveValue('ada@uwaterloo.ca');
  });

  it('autosaves as the applicant types, with no Save button to forget', async () => {
    const user = userEvent.setup();
    setup();
    expect(screen.queryByRole('button', { name: /save draft/i })).toBeNull();

    await user.type(screen.getByLabelText(/first name/i), 'Ada');
    await waitFor(() => {
      const stored = JSON.parse(
        window.localStorage.getItem('bots2026.application.draft.v1'),
      );
      expect(stored.formData.first_name).toBe('Ada');
    });
  });
});

describe('submitting', () => {
  it('sends the form and the captcha token to the service', async () => {
    const user = userEvent.setup();
    submitApplication.mockResolvedValue({
      id: 'app-1',
      status: 'submitted',
      status_token: 'tok-1',
      submitted_at: '2026-09-01T12:00:00Z',
    });
    saveDraft(completeDraft(), '');
    setup();

    await user.click(screen.getByRole('button', { name: /submit application/i }));

    await waitFor(() => expect(submitApplication).toHaveBeenCalledTimes(1));
    const [form, token] = submitApplication.mock.calls[0];
    expect(form.email).toBe('ada@uwaterloo.ca');
    expect(token).toBe('test-captcha-token');
  });

  /**
   * The status link is the only route back to the application: there is no
   * account to sign into, and email is exactly what could not be relied on.
   * Storing it without showing it would strand the applicant.
   */
  it('shows the status link in full after submitting', async () => {
    const user = userEvent.setup();
    submitApplication.mockResolvedValue({
      id: 'app-1',
      status: 'submitted',
      status_token: 'tok-1',
      submitted_at: '2026-09-01T12:00:00Z',
    });
    saveDraft(completeDraft(), '');
    setup();

    await user.click(screen.getByRole('button', { name: /submit application/i }));

    expect(await screen.findByText(/application received/i)).toBeInTheDocument();
    expect(screen.getByText(new RegExp('/apply/status/tok-1'))).toBeInTheDocument();
  });

  it('does not call the service when required fields are missing', async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole('button', { name: /submit application/i }));
    expect(submitApplication).not.toHaveBeenCalled();
    expect(await screen.findByText(/fix the highlighted fields/i)).toBeInTheDocument();
  });

  /**
   * The server re-runs every rule the form runs, so it can reject something
   * the client let through. Without this the applicant gets a banner over a
   * form that looks entirely fine and no way to find the offending field.
   */
  it('puts a server-side field rejection back on the field', async () => {
    const user = userEvent.setup();
    const error = new Error('Please fix the highlighted fields.');
    error.fieldErrors = {
      email: 'An application already exists for this email address.',
    };
    submitApplication.mockRejectedValue(error);
    saveDraft(completeDraft(), '');
    setup();

    await user.click(screen.getByRole('button', { name: /submit application/i }));

    expect(
      await screen.findByText(/already exists for this email/i),
    ).toBeInTheDocument();
  });

  it('remembers a submission across a reload rather than offering a second try', async () => {
    const user = userEvent.setup();
    submitApplication.mockResolvedValue({
      id: 'app-1',
      status: 'submitted',
      status_token: 'tok-1',
      submitted_at: '2026-09-01T12:00:00Z',
    });
    saveDraft(completeDraft(), '');
    const first = setup();
    await user.click(screen.getByRole('button', { name: /submit application/i }));
    await screen.findByText(/application received/i);
    first.unmount();

    setup();
    expect(screen.getByText(/application received/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /submit application/i })).toBeNull();
  });
});
