import { useEffect, useMemo, useState } from 'react';
import { CalendarClock, CheckCircle2, Loader2, MailWarning } from 'lucide-react';
import ApplicationForm from '../admissions/ApplicationForm';
import AuthPanel from '../admissions/AuthPanel';
import PortalShell from '../admissions/PortalShell';
import StatusBadge from '../admissions/StatusBadge';
import {
  applicationRecordToForm,
  getOrCreateApplication,
  removeResume,
  saveApplicationDraft,
  submitApplication,
  uploadResume,
} from '../admissions/applicationService';
import {
  formatDeadline,
  isDeadlinePassed,
  portalConfig,
} from '../admissions/portalConfig';
import {
  getCompletionStats,
  validateApplication,
} from '../admissions/applicationValidation';
import { supabase } from '../admissions/supabaseClient';
import { useSupabaseSession } from '../admissions/useSupabaseSession';

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
            enable admissions auth and storage.
          </p>
        </div>
      </div>
    </div>
  );
}

function DashboardCard({ application, completion }) {
  return (
    <div className="grid gap-5 lg:grid-cols-3">
      <div className="glass-panel rounded-3xl border border-primary/10 bg-surface-container-lowest/80 p-6 backdrop-blur-2xl">
        <div className="font-mono text-[10px] font-bold uppercase tracking-widest text-outline">
          Status
        </div>
        <div className="mt-4">
          <StatusBadge status={application?.status} />
        </div>
        <p className="mt-4 text-sm leading-relaxed text-on-surface-variant">
          {application?.status === 'incomplete'
            ? 'Draft in progress. Submit before the deadline for review.'
            : 'Your application is locked and visible to the admissions team.'}
        </p>
      </div>

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
    </div>
  );
}

export default function AdmissionsPage() {
  const { configured, loading, user } = useSupabaseSession();
  const [application, setApplication] = useState(null);
  const [formData, setFormData] = useState(null);
  const [errors, setErrors] = useState({});
  const [pageError, setPageError] = useState('');
  const [pageMessage, setPageMessage] = useState('');
  const [loadingApplication, setLoadingApplication] = useState(false);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [uploadingResume, setUploadingResume] = useState(false);

  const deadlinePassed = isDeadlinePassed();
  const readOnly = application?.status && application.status !== 'incomplete';
  const completion = useMemo(
    () => getCompletionStats(formData || {}),
    [formData],
  );

  useEffect(() => {
    let active = true;

    queueMicrotask(() => {
      if (!active) {
        return;
      }

      if (!user) {
        setApplication(null);
        setFormData(null);
        return;
      }

      setLoadingApplication(true);
      setPageError('');

      getOrCreateApplication(user)
        .then((record) => {
          if (!active) {
            return;
          }
          setApplication(record);
          setFormData(applicationRecordToForm(record));
        })
        .catch((error) => {
          if (active) {
            setPageError(error.message);
          }
        })
        .finally(() => {
          if (active) {
            setLoadingApplication(false);
          }
        });
    });

    return () => {
      active = false;
    };
  }, [user]);

  const handleSignOut = async () => {
    await supabase?.auth.signOut();
  };

  const handleSave = async () => {
    if (!formData || !application || !user) {
      return;
    }

    setSaving(true);
    setPageError('');
    setPageMessage('');
    try {
      const record = await saveApplicationDraft(formData, application);
      setApplication(record);
      setFormData(applicationRecordToForm(record));
      setPageMessage('Draft saved.');
    } catch (error) {
      setPageError(error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!formData || !application || !user) {
      return;
    }

    const validationErrors = validateApplication(formData);
    setErrors(validationErrors);
    setPageMessage('');

    if (Object.keys(validationErrors).length > 0) {
      setPageError('Please fix the highlighted fields before submitting.');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    setSubmitting(true);
    setPageError('');
    try {
      const record = await submitApplication(formData, application);
      setApplication(record);
      setFormData(applicationRecordToForm(record));
      setPageMessage('Application submitted. Good luck!');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (error) {
      setPageError(error.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleResumeUpload = async (file) => {
    if (!application || !user) {
      return;
    }

    setUploadingResume(true);
    setPageError('');
    setPageMessage('');
    try {
      const record = await uploadResume(file, user, application.id);
      setApplication(record);
      setPageMessage('Resume uploaded.');
    } catch (error) {
      setPageError(error.message);
    } finally {
      setUploadingResume(false);
    }
  };

  const handleResumeRemove = async () => {
    if (!application) {
      return;
    }

    setUploadingResume(true);
    setPageError('');
    setPageMessage('');
    try {
      const record = await removeResume(application.id, application.resume_path);
      setApplication(record);
      setPageMessage('Resume removed.');
    } catch (error) {
      setPageError(error.message);
    } finally {
      setUploadingResume(false);
    }
  };

  return (
    <PortalShell
      onSignOut={handleSignOut}
      subtitle="The portal for BOTS 2026 applications. Sign in, save your draft, upload an optional resume, and submit before the deadline."
      user={user}
    >
      {!configured && <SetupNotice />}

      {configured && loading && (
        <div className="flex items-center gap-3 text-on-surface-variant">
          <Loader2 className="animate-spin text-primary" size={18} />
          Checking session...
        </div>
      )}

      {configured && !loading && !user && <AuthPanel />}

      {configured && user && loadingApplication && (
        <div className="flex items-center gap-3 text-on-surface-variant">
          <Loader2 className="animate-spin text-primary" size={18} />
          Loading your application...
        </div>
      )}

      {configured && user && application && formData && (
        <div className="space-y-8">
          <DashboardCard application={application} completion={completion} />

          {deadlinePassed && application.status === 'incomplete' && (
            <div className="rounded-2xl border border-rose-400/20 bg-rose-950/20 p-5 text-sm text-rose-100">
              The application deadline has passed. Draft edits and submissions
              are now closed.
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
            application={application}
            deadlinePassed={deadlinePassed}
            errors={errors}
            formData={formData}
            onChange={(nextFormData) => {
              setFormData(nextFormData);
              setErrors({});
            }}
            onResumeRemove={handleResumeRemove}
            onResumeUpload={handleResumeUpload}
            onSave={handleSave}
            onSubmit={handleSubmit}
            readOnly={readOnly}
            saving={saving}
            submitting={submitting}
            uploadingResume={uploadingResume}
          />
        </div>
      )}
    </PortalShell>
  );
}
