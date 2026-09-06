import { useEffect, useRef } from 'react';
import QRCode from 'qrcode';
import RsvpBadge from './RsvpBadge';
import { portalConfig } from './portalConfig';

function formatTime(value) {
  return new Intl.DateTimeFormat('en-CA', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'America/Toronto',
  }).format(new Date(value));
}

/**
 * The thing shown at the door. The QR encodes the status URL, which is the
 * bookmark the applicant already holds -- so it discloses nothing new, and a
 * phone camera outside the scan page still lands somewhere sensible.
 */
export default function TicketCard({ application, statusUrl }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    QRCode.toCanvas(canvasRef.current, statusUrl, {
      width: 240,
      margin: 1,
      color: { dark: '#0c0e17', light: '#ffffff' },
    }).catch(() => {
      // Nothing to do: the text fallback below is always rendered.
    });
  }, [statusUrl]);

  return (
    <div className="mt-8 rounded-3xl border border-emerald-400/20 bg-emerald-950/10 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="font-mono text-[10px] font-bold uppercase tracking-widest text-outline">
            Your ticket
          </div>
          <div className="mt-2 font-display text-2xl font-black uppercase text-white">
            {application.first_name}
          </div>
          <div className="mt-1 text-sm text-on-surface-variant">
            {application.school} · {application.preferred_track}
          </div>
        </div>
        <RsvpBadge application={application} />
      </div>

      <div className="mt-6 flex flex-col items-center gap-4 sm:flex-row sm:items-start">
        <div className="rounded-2xl bg-white p-3">
          <canvas aria-label="Your check-in QR code" ref={canvasRef} />
        </div>
        <div className="text-sm leading-relaxed text-on-surface-variant">
          <p className="text-white">Show this at the door.</p>
          <p className="mt-2 text-white">
            {portalConfig.venue}
            <br />
            <span className="text-on-surface-variant">
              {portalConfig.venueAddress}
            </span>
          </p>
          <p className="mt-2">
            Screenshot it now in case you lose the link. Anyone at the desk can
            also find you by name.
          </p>
          {/* Rendered only once the guide exists. An empty href would be a
              link to the current page, which is worse than no link at all --
              the same failure policyLinks.codeOfConduct had. */}
          {portalConfig.hackerGuideUrl && (
            <p className="mt-2">
              <a
                className="text-primary underline"
                href={portalConfig.hackerGuideUrl}
                rel="noreferrer"
                target="_blank"
              >
                Read the hacker guide
              </a>{' '}
              before you arrive.
            </p>
          )}
          {application.checked_in_at && (
            // No trailing period: en-CA's short timeStyle already ends the
            // string with "p.m.", and appending one rendered "8:58 p.m..".
            <p className="mt-2 text-emerald-300">
              Checked in {formatTime(application.checked_in_at)}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
