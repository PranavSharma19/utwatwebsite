import { useRef, useState } from 'react';
import { Mail, Send } from 'lucide-react';
import { Turnstile } from '@marsidev/react-turnstile';
import { isSupabaseConfigured, supabase } from './supabaseClient';
import {
  clearCapturedAuthError,
  describeAuthError,
  getCapturedAuthError,
} from './authError';

// .trim() strips stray whitespace / BOM that env tooling can prepend, which
// would otherwise make Cloudflare reject the sitekey as malformed.
const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY?.trim();

export default function AuthPanel({ redirectPath = '/apply' }) {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [captchaToken, setCaptchaToken] = useState('');
  const [captchaError, setCaptchaError] = useState('');
  const turnstileRef = useRef(null);
  // Captured in main.jsx before supabase-js wiped the fragment. Someone who
  // arrives from a dead magic link needs to be told that is what happened;
  // otherwise the page looks like an ordinary sign-in prompt they already
  // completed.
  const [linkFailure, setLinkFailure] = useState(() => getCapturedAuthError());

  // The widget only renders when a site key is configured, so local/dev
  // builds without the key keep working (Supabase captcha must be off then).
  const captchaEnabled = Boolean(TURNSTILE_SITE_KEY);

  const resetCaptcha = () => {
    setCaptchaToken('');
    turnstileRef.current?.reset();
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setStatus('');
    // They are acting on the advice in the notice, so retire it.
    setLinkFailure(null);
    clearCapturedAuthError();

    if (!isSupabaseConfigured) {
      setError(
        'Supabase is not configured yet. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your local environment.',
      );
      return;
    }

    if (captchaEnabled && !captchaToken) {
      setError('Please complete the verification challenge first.');
      return;
    }

    setSending(true);
    const { error: authError } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}${redirectPath}`,
        captchaToken: captchaToken || undefined,
      },
    });
    setSending(false);

    // Turnstile tokens are single-use; reset after every attempt.
    if (captchaEnabled) {
      resetCaptcha();
    }

    if (authError) {
      setError(authError.message);
      return;
    }

    setStatus('Check your inbox for a secure sign-in link.');
  };

  return (
    <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
      <div className="glass-panel rounded-3xl border border-primary/10 bg-surface-container-lowest/80 p-8 backdrop-blur-2xl">
        <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary">
          <Mail size={22} />
        </div>
        <h2 className="font-display text-2xl font-black uppercase text-white">
          Sign In With Email
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-on-surface-variant">
          Enter the email you want tied to your application. We will send a
          passwordless link, then bring you back here to continue.
        </p>

        {linkFailure && (
          <div
            role="alert"
            data-testid="auth-link-failure"
            className="mt-6 rounded-xl border border-amber-400/25 bg-amber-950/20 px-4 py-3 text-left"
          >
            <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-amber-300">
              {describeAuthError(linkFailure).title}
            </p>
            <p className="mt-2 text-sm leading-relaxed text-amber-100/90">
              {describeAuthError(linkFailure).detail}
            </p>
          </div>
        )}

        <form className="mt-8 space-y-4" onSubmit={handleSubmit}>
          <label className="block">
            <span className="mb-2 block font-mono text-[10px] font-bold uppercase tracking-widest text-outline">
              Email Address
            </span>
            <input
              className="w-full rounded-xl border border-primary/10 bg-surface-container-lowest/90 px-4 py-4 text-sm text-white outline-none transition-all placeholder:text-outline focus:border-primary/50 focus:shadow-[0_0_20px_rgba(46,91,255,0.15)]"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@school.edu"
              required
            />
          </label>

          {error && (
            <div className="rounded-xl border border-rose-400/20 bg-rose-950/20 px-4 py-3 text-sm text-rose-200">
              {error}
            </div>
          )}

          {status && (
            <div className="rounded-xl border border-emerald-400/20 bg-emerald-950/20 px-4 py-3 text-sm text-emerald-200">
              {status}
            </div>
          )}

          {captchaEnabled && (
            <div className="space-y-2">
              <Turnstile
                ref={turnstileRef}
                siteKey={TURNSTILE_SITE_KEY}
                onSuccess={(token) => {
                  setCaptchaToken(token);
                  setCaptchaError('');
                }}
                onError={() => {
                  setCaptchaToken('');
                  setCaptchaError(
                    'Verification could not load. Refresh the page or disable any ad blocker, then try again.',
                  );
                }}
                onExpire={() => setCaptchaToken('')}
                options={{ theme: 'dark' }}
              />
              {captchaError && (
                <p className="text-xs text-rose-300">{captchaError}</p>
              )}
            </div>
          )}

          <button
            className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-cyber-blue to-primary-container px-8 py-4 text-sm font-bold uppercase tracking-widest text-white shadow-glow-blue transition-all hover:scale-[1.01] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
            disabled={sending || (captchaEnabled && !captchaToken)}
            type="submit"
          >
            <Send size={16} className="text-secondary-fixed" />
            {sending ? 'Sending...' : 'Send Sign-In Link'}
          </button>
        </form>
      </div>

      <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-8">
        <h3 className="font-display text-lg font-bold uppercase text-white">
          What You Can Do Here
        </h3>
        <div className="mt-6 space-y-4 text-sm leading-relaxed text-on-surface-variant">
          <p>Save your draft before the deadline.</p>
          <p>Upload an optional PDF resume and share project links.</p>
          <p>Submit once, then track your admissions status from the dashboard.</p>
        </div>
      </div>
    </div>
  );
}
