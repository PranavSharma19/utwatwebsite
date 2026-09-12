import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Check, Copy, ExternalLink, HelpCircle, Loader2, Sparkles } from 'lucide-react';
import PortalShell from '../admissions/PortalShell';
import { claimSignupCode } from '../admissions/applicationService';
import { portalConfig } from '../admissions/portalConfig';

/**
 * Where an attending applicant claims their Anthropic signup code.
 *
 * The token in the URL is the whole credential -- the same one that gates the
 * status page and RSVP. The claim-key function checks it names an *attending*
 * applicant before handing back a code, and hands back the SAME code on every
 * revisit, so this page is safe to reload and safe to bookmark. It never shows
 * more than one code, and it cannot be used to fish for someone else's: an
 * unknown or non-attending token gets a plain message, not a code.
 */
export default function ClaimPage() {
  const { token } = useParams();
  const [state, setState] = useState({ loading: true, outcome: '', link: '', error: '' });
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let active = true;
    claimSignupCode(token)
      .then((data) => {
        if (active) {
          setState({
            loading: false,
            outcome: data?.outcome || 'not_found',
            link: data?.signup_link || '',
            error: '',
          });
        }
      })
      .catch((err) => {
        if (active) {
          setState({ loading: false, outcome: '', link: '', error: err.message });
        }
      });
    return () => {
      active = false;
    };
  }, [token]);

  const { loading, outcome, link, error } = state;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard can be blocked; the link is visible and clickable regardless.
    }
  };

  const mailto = (
    <a className="text-primary hover:underline" href={`mailto:${portalConfig.contactEmail}`}>
      {portalConfig.contactEmail}
    </a>
  );

  return (
    <PortalShell
      eyebrow="Claude Credits"
      subtitle="Your Anthropic signup code for Battle of the Schools 2026."
      title="Claim Your Credits"
    >
      {loading && (
        <div className="flex items-center gap-3 text-on-surface-variant">
          <Loader2 className="animate-spin text-primary" size={18} />
          Checking your spot...
        </div>
      )}

      {!loading && error && (
        <div className="rounded-2xl border border-rose-400/20 bg-rose-950/20 p-5 text-sm text-rose-100">
          Something went wrong reaching the claim service. Please try again in a
          moment, or find an organizer at the desk. ({error})
        </div>
      )}

      {!loading && !error && (outcome === 'claimed' || outcome === 'already_claimed') && (
        <div className="glass-panel max-w-2xl rounded-3xl border border-primary/10 bg-surface-container-lowest/80 p-8 backdrop-blur-2xl">
          <div className="flex items-center gap-3">
            <Sparkles className="shrink-0 text-primary" size={22} />
            <h2 className="font-display text-2xl font-black uppercase text-white">
              {outcome === 'already_claimed' ? 'Here it is again' : "You're in"}
            </h2>
          </div>
          <p className="mt-4 text-sm leading-relaxed text-on-surface-variant">
            {outcome === 'already_claimed'
              ? 'This is the same code tied to your spot -- claiming again always shows you this one, never a new one.'
              : 'This code is yours. Open the link below and follow the prompts to redeem your Claude credits on the Anthropic platform.'}
          </p>

          <a
            href={link}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-6 inline-flex items-center gap-2 rounded-2xl bg-primary px-6 py-3 font-display text-sm font-black uppercase tracking-wide text-on-primary transition hover:opacity-90"
          >
            Redeem my credits
            <ExternalLink size={16} />
          </a>

          <div className="mt-6">
            <div className="font-mono text-[10px] font-bold uppercase tracking-widest text-outline">
              Your link
            </div>
            <div className="mt-2 flex items-start gap-2">
              <code className="min-w-0 flex-1 break-all rounded-xl border border-white/10 bg-black/30 p-3 font-mono text-xs text-on-surface-variant">
                {link}
              </code>
              <button
                type="button"
                onClick={handleCopy}
                className="inline-flex shrink-0 items-center gap-1 rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-xs text-white transition hover:bg-white/10"
              >
                {copied ? <Check size={14} /> : <Copy size={14} />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>

          <p className="mt-6 text-xs leading-relaxed text-outline">
            Keep this to yourself -- each code works once. Trouble redeeming?
            Email {mailto}.
          </p>
        </div>
      )}

      {!loading && !error && outcome === 'not_attending' && (
        <div className="glass-panel rounded-3xl border border-secondary-fixed/20 bg-secondary-fixed/5 p-8">
          <div className="flex items-start gap-4">
            <HelpCircle className="mt-1 shrink-0 text-secondary-fixed" size={24} />
            <div>
              <h2 className="font-display text-2xl font-black uppercase text-white">
                Codes are for attendees
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-on-surface-variant">
                These signup codes go to applicants who RSVP&apos;d as attending.
                This link&apos;s spot isn&apos;t marked attending, so there&apos;s
                no code to claim here.
              </p>
              <p className="mt-3 text-sm leading-relaxed text-on-surface-variant">
                If you did RSVP and think this is a mistake, check your status at
                your application link, or email {mailto} from the address you
                applied with.
              </p>
            </div>
          </div>
        </div>
      )}

      {!loading && !error && outcome === 'exhausted' && (
        <div className="glass-panel rounded-3xl border border-secondary-fixed/20 bg-secondary-fixed/5 p-8">
          <h2 className="font-display text-2xl font-black uppercase text-white">
            All codes are out
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-on-surface-variant">
            Every signup code has been claimed. Please find an organizer at the
            desk -- we&apos;ll sort you out.
          </p>
        </div>
      )}

      {!loading && !error && outcome === 'not_found' && (
        <div className="glass-panel rounded-3xl border border-secondary-fixed/20 bg-secondary-fixed/5 p-8">
          <div className="flex items-start gap-4">
            <HelpCircle className="mt-1 shrink-0 text-secondary-fixed" size={24} />
            <div>
              <h2 className="font-display text-2xl font-black uppercase text-white">
                Link not recognized
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-on-surface-variant">
                That link doesn&apos;t match an application. It may have been
                truncated when copied -- check you have the whole thing, including
                everything after the last slash.
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
    </PortalShell>
  );
}
