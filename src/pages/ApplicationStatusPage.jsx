import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { HelpCircle, Loader2 } from 'lucide-react';
import PortalShell from '../admissions/PortalShell';
import StatusBadge from '../admissions/StatusBadge';
import RsvpForm from '../admissions/RsvpForm';
import TicketCard from '../admissions/TicketCard';
import { fetchApplicationStatus, submitRsvp } from '../admissions/applicationService';
import { formatRsvpDeadline, portalConfig } from '../admissions/portalConfig';
import { deriveStatusView } from '../admissions/statusView';

/**
 * What replaces "sign in to check your status".
 *
 * The token in the URL is the whole credential. That is a deliberate trade: an
 * emailed sign-in link is a bearer token too, and this one has the advantage
 * of actually reaching the applicant -- which the emailed kind demonstrably
 * did not for @uwaterloo.ca and @utoronto.ca addresses. The endpoint behind
 * this returns the status columns plus RSVP state and nothing else, so a
 * shared or shoulder-surfed link discloses a first name, a school, a track, a
 * decision, and an RSVP -- which, since STATUS_COLUMNS widened for RSVP, now
 * also means the emergency contact's name and phone number and any dietary
 * notes, all of which this page renders. Still a fair trade against a full
 * application, but check this comment before assuming otherwise.
 */
export default function ApplicationStatusPage() {
  const { token } = useParams();
  const [state, setState] = useState({ loading: true, application: null, error: '' });

  useEffect(() => {
    let active = true;

    fetchApplicationStatus(token)
      .then((application) => {
        if (active) setState({ loading: false, application, error: '' });
      })
      .catch((error) => {
        if (active) {
          setState({ loading: false, application: null, error: error.message });
        }
      });

    return () => {
      active = false;
    };
  }, [token]);

  const { loading, application, error } = state;

  const view = deriveStatusView(application);
  const statusUrl = `${window.location.origin}/apply/status/${token}`;

  const handleRsvp = async (form) => {
    const updated = await submitRsvp(token, form);
    setState({ loading: false, application: updated, error: '' });
  };

  const subtitle =
    view === 'plain'
      ? 'We will email your decision before the event. This page shows where things stand until then.'
      : 'You are in. This page is your RSVP and, once you have RSVP’d, your ticket.';

  return (
    <PortalShell
      eyebrow="Application Status"
      subtitle={subtitle}
      title="Your Application"
    >
      {loading && (
        <div className="flex items-center gap-3 text-on-surface-variant">
          <Loader2 className="animate-spin text-primary" size={18} />
          Looking up your application...
        </div>
      )}

      {!loading && error && (
        <div className="rounded-2xl border border-rose-400/20 bg-rose-950/20 p-5 text-sm text-rose-100">
          {error}
        </div>
      )}

      {!loading && !error && !application && (
        <div className="glass-panel rounded-3xl border border-secondary-fixed/20 bg-secondary-fixed/5 p-8">
          <div className="flex items-start gap-4">
            <HelpCircle className="mt-1 shrink-0 text-secondary-fixed" size={24} />
            <div>
              <h2 className="font-display text-2xl font-black uppercase text-white">
                No Application Found
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-on-surface-variant">
                That link does not match an application. It may have been
                truncated when it was copied — check that you have the whole
                thing, including everything after the last slash.
              </p>
              <p className="mt-3 text-sm leading-relaxed text-on-surface-variant">
                If you cannot recover the link, email{' '}
                <a
                  className="text-primary hover:underline"
                  href={`mailto:${portalConfig.contactEmail}`}
                >
                  {portalConfig.contactEmail}
                </a>{' '}
                from the address you applied with.
              </p>
              <Link
                className="mt-6 inline-flex font-mono text-[10px] font-bold uppercase tracking-widest text-primary hover:underline"
                to="/apply"
              >
                Back to the application
              </Link>
            </div>
          </div>
        </div>
      )}

      {!loading && application && (
        <div className="glass-panel max-w-2xl rounded-3xl border border-primary/10 bg-surface-container-lowest/80 p-8 backdrop-blur-2xl">
          <div className="font-mono text-[10px] font-bold uppercase tracking-widest text-outline">
            Status
          </div>
          <div className="mt-4">
            <StatusBadge status={application.status} />
          </div>

          <dl className="mt-8 grid gap-5 sm:grid-cols-2">
            {[
              ['Applicant', application.first_name],
              ['School', application.school],
              ['Track', application.preferred_track],
              [
                'Submitted',
                application.submitted_at
                  ? new Intl.DateTimeFormat('en-CA', {
                      dateStyle: 'long',
                      timeZone: 'America/Toronto',
                    }).format(new Date(application.submitted_at))
                  : '--',
              ],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="font-mono text-[10px] font-bold uppercase tracking-widest text-outline">
                  {label}
                </dt>
                <dd className="mt-2 text-sm text-white">{value || '--'}</dd>
              </div>
            ))}
          </dl>

          {view === 'plain' && (
            <p className="mt-8 text-sm leading-relaxed text-on-surface-variant">
              Decisions go out before the event on {portalConfig.eventDateRange}.
              Check back here, this page always shows the current state, whether
              or not our email reaches you.
            </p>
          )}

          {view === 'rsvp-waiting' && (
            <div className="mt-8 rounded-2xl border border-primary/20 bg-primary/5 p-5 text-sm leading-relaxed text-on-surface-variant">
              RSVP opens shortly. Come back to this link; we will also email you when it does.
            </div>
          )}

          {view === 'rsvp-open' && (
            <RsvpForm application={application} onSubmit={handleRsvp} />
          )}

          {view === 'rsvp-closed' && (
            <div className="mt-8 rounded-2xl border border-rose-400/20 bg-rose-950/20 p-5 text-sm leading-relaxed text-rose-100">
              RSVPs closed on {formatRsvpDeadline(application.rsvp_deadline)} and
              this spot has been released. If something went wrong, email{' '}
              <a className="underline" href={`mailto:${portalConfig.contactEmail}`}>
                {portalConfig.contactEmail}
              </a>
              .
            </div>
          )}

          {view === 'underage' && (
            <div className="mt-8 rounded-2xl border border-secondary-fixed/20 bg-secondary-fixed/5 p-5 text-sm leading-relaxed text-on-surface-variant">
              The event is 18+, and this application says you are under 18. If
              that is wrong, email{' '}
              <a className="text-primary hover:underline" href={`mailto:${portalConfig.contactEmail}`}>
                {portalConfig.contactEmail}
              </a>{' '}
              from the address you applied with.
            </div>
          )}

          {view === 'declined' && (
            <div className="mt-8 rounded-2xl border border-white/10 bg-white/5 p-5 text-sm leading-relaxed text-on-surface-variant">
              Sorry you can&apos;t make it. Thanks for letting us know; your spot
              has gone to someone on the waitlist.
            </div>
          )}

          {(view === 'attending' || view === 'checked-in') && (
            <>
              <TicketCard application={application} statusUrl={statusUrl} />
              <dl className="mt-6 grid gap-4 text-sm sm:grid-cols-2">
                <div>
                  <dt className="font-mono text-[10px] font-bold uppercase tracking-widest text-outline">Emergency contact</dt>
                  <dd className="mt-1 text-white">
                    {application.emergency_contact_name} · {application.emergency_contact_phone}
                  </dd>
                </div>
                <div>
                  <dt className="font-mono text-[10px] font-bold uppercase tracking-widest text-outline">Dietary</dt>
                  <dd className="mt-1 text-white">{application.dietary_restrictions || 'None given'}</dd>
                </div>
              </dl>
            </>
          )}
        </div>
      )}
    </PortalShell>
  );
}
