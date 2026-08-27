import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CalendarClock,
  CheckCircle2,
  Copy,
  MailWarning,
} from 'lucide-react';
import { Turnstile } from '@marsidev/react-turnstile';
import ApplicationForm from '../admissions/ApplicationForm';
import PortalShell from '../admissions/PortalShell';
import {
  submitApplication,
  uploadResume,
} from '../admissions/applicationService';
import {
  clearDraft,
  loadDraft,
  loadSubmission,
  saveDraft,
  saveSubmission,
} from '../admissions/draftStorage';
import {
  emptyApplicationForm,
  formatDeadline,
  isDeadlinePassed,
  portalConfig,
} from '../admissions/portalConfig';
import {
  getCompletionStats,
  validateApplication,
} from '../admissions/applicationValidation';
import { isSupabaseConfigured } from '../admissions/supabaseClient';

// .trim() strips stray whitespace / BOM that env tooling can prepend, which
// would otherwise make Cloudflare reject the sitekey as malformed. (Same bug,
// same fix, as src/faction/FactionChoice.jsx.)
const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY?.trim();

function SetupNotice() {
  return (
    <div className="glass-panel rounded-3xl border border-secondary-fixed/20 bg-secondary-fixed/5 p-8">
      <div className="flex items-start gap-4">
        <MailWarning className="mt-1 shrink-0 text-secondary-fixed" size={24} />
        <div>
          <h2 className="font-display text-2xl font-black uppercase text-white">
            Supabase Setup Required
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-on-surface-variant">
            Add <code>VITE_SUPABASE_URL</code> and{' '}
            <code>VITE_SUPABASE_ANON_KEY</code> to your local environment to
            enable applications.
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * What an applicant sees after submitting, and what they see if they come back
 * to /apply on the same browser afterwards.
 *
 * The status link is offered here, not pressed on them. This browser already
 * remembers the submission, and decisions are emailed, so the link is what you
 * need to check from a different device -- not a lifeline to guard for a month.
 * The earlier copy called it "the only way back", which was both alarming and
 * untrue: coming back to /apply on this browser lands right here.
 */
function SubmittedPanel({ submission }) {
  const [copied, setCopied] = useState(false);
  const statusUrl = `${window.location.origin}/apply/status/${submission.statusToken}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(statusUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Clipboard access is refused in plenty of ordinary situations. The link
      // is on screen and selectable, so there is nothing to recover from.
    }
  };

  return (
    <div className="glass-panel rounded-3xl border border-emerald-400/20 bg-emerald-950/10 p-8">
      <div className="flex items-start gap-4">
        <CheckCircle2 className="mt-1 shrink-0 text-emerald-300" size={24} />
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-2xl font-black uppercase text-white">
            Application Received
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-on-surface-variant">
            You are in the pile for {portalConfig.eventName}{' '}
            {portalConfig.eventYear}. We will email you your decision before the
            event on {portalConfig.eventDateRange} -- you do not need to do
            anything until then.
          </p>

          <div className="mt-6 rounded-2xl border border-primary/20 bg-primary/5 p-5">
            <div className="font-mono text-[10px] font-bold uppercase tracking-widest text-primary">
              Check from another device
            </div>
            <p className="mt-2 text-sm leading-relaxed text-on-surface-variant">
              Nothing to keep track of: this browser remembers your application,
              so you can just return to{' '}
              <span className="text-white">utwat.ca/apply</span> any time. Copy
              this link only if you want to check from your phone or another
              computer.
            </p>
            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
              <code className="min-w-0 flex-1 overflow-x-auto rounded-xl border border-white/10 bg-black/30 px-4 py-3 font-mono text-xs text-white">
                {statusUrl}
              </code>
              <button
                className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-5 py-3 font-mono text-[10px] font-bold uppercase tracking-widest text-primary transition-colors hover:bg-primary/20"
                onClick={copy}
                type="button"
              >
                <Copy size={14} />
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>

          <Link
            className="mt-6 inline-flex font-mono text-[10px] font-bold uppercase tracking-widest text-primary hover:underline"
            to={`/apply/status/${submission.statusToken}`}
          >
            Open status page
          </Link>
        </div>
      </div>
    </div>
  );
}

function ProgressCards({ completion, resumePath }) {
  return (
    <div className="grid gap-5 lg:grid-cols-3">
      <div className="glass-panel rounded-3xl border border-primary/10 bg-surface-container-lowest/80 p-6 backdrop-blur-2xl">
        <div className="font-mono text-[10px] font-bold uppercase tracking-widest text-outline">
          Deadline
        </div>
        <div className="mt-4 flex items-center gap-3 text-white">
          <CalendarClock className="text-secondary-fixed" size={20} />
          <span className="font-display text-lg font-bold">
            {formatDeadline()}
          </span>
        </div>
        <p className="mt-4 text-sm leading-relaxed text-on-surface-variant">
          Toronto time. The event runs {portalConfig.eventDateRange}.
        </p>
      </div>

      <div className="glass-panel rounded-3xl border border-primary/10 bg-surface-container-lowest/80 p-6 backdrop-blur-2xl">
        <div className="font-mono text-[10px] font-bold uppercase tracking-widest text-outline">
          Required Progress
        </div>
        <div className="mt-4 flex items-center gap-3">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-gradient-to-r from-cyber-blue to-secondary-fixed"
              style={{ width: `${completion.percent}%` }}
            />
          </div>
          <span className="font-mono text-xs font-bold text-primary">
            {completion.percent}%
          </span>
        </div>
        <p className="mt-4 text-sm leading-relaxed text-on-surface-variant">
          {completion.complete} of {completion.total} required fields complete.
        </p>
      </div>

      <div className="glass-panel rounded-3xl border border-primary/10 bg-surface-container-lowest/80 p-6 backdrop-blur-2xl">
        <div className="font-mono text-[10px] font-bold uppercase tracking-widest text-outline">
          Resume
        </div>
        <div className="mt-4 font-display text-lg font-bold text-white">
          {resumePath ? 'Attached' : 'Not attached'}
        </div>
        <p className="mt-4 text-sm leading-relaxed text-on-surface-variant">
          Optional. A PDF helps, but a strong written application stands on its
          own.
        </p>
      </div>
    </div>
  );
}

export default function AdmissionsPage() {
  const [formData, setFormData] = useState(() => {
    const draft = loadDraft();
    return draft ? { ...emptyApplicationForm, ...draft.formData } : { ...emptyApplicationForm };
  });
  const [resumePath, setResumePath] = useState(() => loadDraft()?.resumePath || '');
  // Shown back to the applicant so they can confirm they attached the right
  // document. The stored path is a server-chosen UUID and says nothing.
  const [resumeName, setResumeName] = useState(() => loadDraft()?.resumeName || '');
  const [submission, setSubmission] = useState(() => loadSubmission());
  const [errors, setErrors] = useState({});
  const [pageError, setPageError] = useState('');
  const [pageMessage, setPageMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [uploadingResume, setUploadingResume] = useState(false);
  const [captchaToken, setCaptchaToken] = useState('');
  const [captchaError, setCaptchaError] = useState('');
  const turnstileRef = useRef(null);

  // The widget only runs when a sitekey is configured, so local dev and the
  // test environment keep the whole form working; only the network call the
  // Edge Function requires a token for is affected.
  const captchaEnabled = Boolean(TURNSTILE_SITE_KEY);
  const deadlinePassed = isDeadlinePassed();
  const completion = useMemo(() => getCompletionStats(formData), [formData]);

  // Persisted on every change rather than behind a Save button: there is no
  // server-side draft any more, so an accidental refresh with no autosave
  // would take the whole application with it.
  useEffect(() => {
    saveDraft(formData, resumePath, resumeName);
  }, [formData, resumePath, resumeName]);

  const resetCaptcha = () => {
    setCaptchaToken('');
    turnstileRef.current?.reset();
  };

  /** Tokens are single-use, so each network call takes the current one and
   *  immediately asks the widget for another. */
  const takeCaptchaToken = () => {
    if (!captchaEnabled) return '';
    const token = captchaToken;
    resetCaptcha();
    return token;
  };

  const handleResumeUpload = async (file) => {
    const token = takeCaptchaToken();
    if (captchaEnabled && !token) {
      setPageError('Verification is still loading. Try again in a moment.');
      return;
    }

    setUploadingResume(true);
    setPageError('');
    setPageMessage('');
    try {
      const path = await uploadResume(file, token);
      setResumePath(path);
      setResumeName(file.name);
      setPageMessage('Resume attached.');
    } catch (error) {
      setPageError(error.message);
    } finally {
      setUploadingResume(false);
    }
  };

  // Nothing to delete server-side: the object is orphaned in the bucket and
  // never referenced by a row, because the path is only recorded at submit.
  const handleResumeRemove = () => {
    setResumePath('');
    setResumeName('');
    setPageMessage('Resume removed.');
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    const validationErrors = validateApplication(formData);
    setErrors(validationErrors);
    setPageMessage('');

    if (Object.keys(validationErrors).length > 0) {
      setPageError('Please fix the highlighted fields before submitting.');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    const token = takeCaptchaToken();
    if (captchaEnabled && !token) {
      setPageError('Verification is still loading. Try again in a moment.');
      return;
    }

    setSubmitting(true);
    setPageError('');
    try {
      const application = await submitApplication(
        { ...formData, resume_path: resumePath },
        token,
      );
      const receipt = {
        id: application.id,
        statusToken: application.status_token,
        submittedAt: application.submitted_at,
      };
      saveSubmission(receipt);
      clearDraft();
      setSubmission(receipt);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (error) {
      // The server re-runs every rule the form runs. When it rejects something
      // the client let through, the message belongs on the field.
      if (error.fieldErrors && Object.keys(error.fieldErrors).length > 0) {
        setErrors(error.fieldErrors);
      }
      setPageError(error.message);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setSubmitting(false);
    }
  };

  const captcha = captchaEnabled ? (
    <div className="space-y-2">
      <Turnstile
        ref={turnstileRef}
        siteKey={TURNSTILE_SITE_KEY}
        onError={() => {
          setCaptchaToken('');
          setCaptchaError(
            'Verification could not load. Refresh the page or disable any ad blocker, then try again.',
          );
        }}
        onExpire={() => setCaptchaToken('')}
        onSuccess={(token) => {
          setCaptchaToken(token);
          setCaptchaError('');
        }}
      />
      {captchaError && <p className="text-xs text-rose-300">{captchaError}</p>}
    </div>
  ) : null;

  return (
    <PortalShell
      subtitle="No account, no sign-in link, no waiting on email. Fill this in and submit it -- your answers stay in this browser until you do."
      title="Apply to Battle of the Schools"
    >
      {!isSupabaseConfigured && <SetupNotice />}

      {isSupabaseConfigured && submission && (
        <SubmittedPanel submission={submission} />
      )}

      {isSupabaseConfigured && !submission && (
        <div className="space-y-8">
          <ProgressCards completion={completion} resumePath={resumePath} />

          {deadlinePassed && (
            <div className="rounded-2xl border border-rose-400/20 bg-rose-950/20 p-5 text-sm text-rose-100">
              The application deadline has passed. Submissions are closed.
            </div>
          )}

          {pageError && (
            <div className="rounded-2xl border border-rose-400/20 bg-rose-950/20 p-5 text-sm text-rose-100">
              {pageError}
            </div>
          )}

          {pageMessage && (
            <div className="flex items-center gap-3 rounded-2xl border border-emerald-400/20 bg-emerald-950/20 p-5 text-sm text-emerald-100">
              <CheckCircle2 size={18} />
              {pageMessage}
            </div>
          )}

          <ApplicationForm
            captcha={captcha}
            captchaReady={!captchaEnabled || Boolean(captchaToken)}
            deadlinePassed={deadlinePassed}
            errors={errors}
            formData={formData}
            onChange={(nextFormData) => {
              setFormData(nextFormData);
              setErrors({});
            }}
            onResumeRemove={handleResumeRemove}
            onResumeUpload={handleResumeUpload}
            onSubmit={handleSubmit}
            resumePath={resumePath}
            resumeName={resumeName}
            submitting={submitting}
            uploadingResume={uploadingResume}
          />
        </div>
      )}
    </PortalShell>
  );
}
