import { useCallback, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import AuthPanel from '../admissions/AuthPanel';
import PortalShell from '../admissions/PortalShell';
import { checkInByEmail, checkInByToken } from '../admissions/applicationService';
import { describeCheckin, parseScannedToken, TONE_CLASSES } from '../admissions/admin/scan';
import { useQrScanner } from '../admissions/admin/useQrScanner';
import { portalConfig } from '../admissions/portalConfig';
import { supabase } from '../admissions/supabaseClient';
import { useSupabaseSession } from '../admissions/useSupabaseSession';

const RESULT_MS = 2000;
const DEBOUNCE_MS = 5000;

export default function CheckInPage() {
  const { configured, loading, user } = useSupabaseSession();
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [count, setCount] = useState(0);
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const recent = useRef(new Map());

  const show = useCallback((response) => {
    const described = describeCheckin(response);
    setResult(described);
    if (response.result === 'checked_in') setCount((c) => c + 1);
    setTimeout(() => setResult(null), RESULT_MS);
  }, []);

  const handleDecode = useCallback(
    async (text) => {
      if (busy) return;
      const token = parseScannedToken(text);
      const key = token || text;
      const last = recent.current.get(key) || 0;
      if (Date.now() - last < DEBOUNCE_MS) return;
      recent.current.set(key, Date.now());

      if (!token) {
        show({ result: 'not_found', application: null });
        return;
      }
      setBusy(true);
      setError('');
      try {
        show(await checkInByToken(token));
      } catch (err) {
        setError(err.message || 'Check-in failed.');
      } finally {
        setBusy(false);
      }
    },
    [busy, show],
  );

  const { videoRef, error: cameraError } = useQrScanner({
    enabled: Boolean(user),
    onDecode: handleDecode,
  });

  const handleEmail = async (event) => {
    event.preventDefault();
    if (!email.trim()) return;
    setBusy(true);
    setError('');
    try {
      show(await checkInByEmail(email.trim()));
      setEmail('');
    } catch (err) {
      setError(err.message || 'Check-in failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <PortalShell
      admin
      eyebrow="Door"
      onSignOut={() => supabase?.auth.signOut()}
      subtitle="Point the camera at the attendee's ticket. Green means go."
      title="Check-in"
      user={user}
    >
      {!configured && (
        <div className="rounded-3xl border border-secondary-fixed/20 bg-secondary-fixed/5 p-8 text-on-surface-variant">
          Configure Supabase env vars before using the door page.
        </div>
      )}
      {configured && loading && (
        <div className="flex items-center gap-3 text-on-surface-variant">
          <Loader2 className="animate-spin text-primary" size={18} />
          Checking session...
        </div>
      )}
      {configured && !loading && !user && (
        <AuthPanel redirectPath={`${portalConfig.adminPath}/checkin`} />
      )}

      {configured && user && (
        <div className="mx-auto max-w-md space-y-5">
          <div className="relative overflow-hidden rounded-3xl border border-primary/20 bg-black">
            <video className="aspect-square w-full object-cover" muted ref={videoRef} />
            {result && (
              <div
                className={`absolute inset-0 flex flex-col items-center justify-center p-6 text-center ${TONE_CLASSES[result.tone]}`}
                role="status"
              >
                <div className="font-display text-4xl font-black uppercase">{result.title}</div>
                <div className="mt-3 text-lg">{result.detail}</div>
              </div>
            )}
          </div>

          {cameraError && (
            <div className="rounded-2xl border border-amber-400/30 bg-amber-950/20 p-4 text-sm text-amber-100">
              {cameraError}
            </div>
          )}
          {error && (
            <div className="rounded-2xl border border-rose-400/20 bg-rose-950/20 p-4 text-sm text-rose-100">
              {error}
            </div>
          )}

          <div className="flex items-center justify-between font-mono text-[10px] font-bold uppercase tracking-widest text-outline">
            <span>Checked in this session: {count}</span>
            <Link className="text-primary hover:underline" to={portalConfig.adminPath}>
              Back to console
            </Link>
          </div>

          <form className="flex gap-2" onSubmit={handleEmail}>
            <input
              aria-label="Attendee email"
              className="w-full rounded-xl border border-primary/10 bg-surface-container-lowest/90 px-4 py-3 text-sm text-white outline-none placeholder:text-outline focus:border-primary/50"
              inputMode="email"
              onChange={(event) => setEmail(event.target.value)}
              placeholder="No code? Type their email"
              value={email}
            />
            <button
              className="rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 font-mono text-[10px] font-bold uppercase tracking-widest text-primary hover:bg-primary/10 disabled:opacity-60"
              disabled={busy}
              type="submit"
            >
              Check in
            </button>
          </form>
        </div>
      )}
    </PortalShell>
  );
}
