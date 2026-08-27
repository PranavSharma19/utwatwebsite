import { Link } from 'react-router-dom';
import { LogOut, Sparkles } from 'lucide-react';
import { portalConfig } from './portalConfig';

export default function PortalShell({
  children,
  eyebrow = 'Admissions Portal',
  title = 'Apply to Battle of the Schools',
  subtitle,
  user,
  onSignOut,
  admin = false,
}) {
  return (
    <div className="min-h-screen bg-transparent text-on-surface font-sans selection:bg-primary/20 selection:text-primary">
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute inset-0 bg-[#11131c]/75" />
        <div className="absolute inset-0 network-pattern opacity-20" />
        <div className="absolute left-[-10%] top-[15%] h-[420px] w-[420px] rounded-full bg-primary-container/15 blur-[120px]" />
        <div className="absolute bottom-[5%] right-[-8%] h-[420px] w-[420px] rounded-full bg-secondary-container/10 blur-[130px]" />
      </div>

      <div className="relative z-10 mx-auto flex min-h-screen max-w-container-max flex-col px-gutter">
        <header className="flex flex-col gap-5 border-b border-primary/10 py-6 md:flex-row md:items-center md:justify-between">
          <div>
            <Link
              to="/"
              className="font-display text-xl font-black uppercase tracking-tight text-white transition-colors hover:text-primary"
            >
              BOTS <span className="text-secondary-fixed">2026</span>
            </Link>
            <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.24em] text-outline">
              {portalConfig.eventDateRange}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Only the admin-side shell links anywhere: an escape hatch back
                to the applicant view. There is deliberately no link INTO the
                console -- it was advertising the reviewer page to every
                applicant, and the only person who needs it can bookmark it. */}
            {admin && (
              <Link
                to="/apply"
                className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-2 font-mono text-[10px] font-bold uppercase tracking-widest text-primary transition-colors hover:bg-primary/10"
              >
                <Sparkles size={14} />
                Applicant View
              </Link>
            )}

            {user && (
              <button
                onClick={onSignOut}
                className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 font-mono text-[10px] font-bold uppercase tracking-widest text-on-surface-variant transition-colors hover:border-rose-400/30 hover:text-rose-300"
                type="button"
              >
                <LogOut size={14} />
                Sign Out
              </button>
            )}
          </div>
        </header>

        <main className="flex-grow py-10">
          <section className="mb-10 max-w-4xl">
            <div className="mb-4 inline-flex rounded-md border border-primary/10 bg-primary/5 px-3 py-1 font-mono text-xs font-bold uppercase tracking-widest text-primary">
              {eyebrow}
            </div>
            <h1 className="font-display text-4xl font-black uppercase leading-tight text-white sm:text-6xl">
              {title}
            </h1>
            <p className="mt-4 max-w-3xl text-sm leading-relaxed text-on-surface-variant sm:text-base">
              {subtitle ||
                'Fill in the form and submit before the deadline. No account required.'}
            </p>
          </section>

          {children}
        </main>
      </div>
    </div>
  );
}
