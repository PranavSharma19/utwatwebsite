export default function About() {
  return (
    <section className="py-24 relative overflow-hidden" id="about">
      {/* Decorative gradients */}
      <div
        aria-hidden="true"
        className="absolute inset-y-0 left-0 w-[520px] pointer-events-none"
        style={{ background: 'radial-gradient(50% 40% at 20% 50%, rgb(var(--accent-rgb) / .10) 0%, transparent 70%)' }}
      />

      <div className="mx-auto max-w-container-max px-gutter relative z-10">

        {/* Core Description block */}
        <div className="max-w-4xl space-y-6">
          <h2 className="font-display text-3xl sm:text-5xl font-black uppercase tracking-tight text-ink leading-tight">
            Battle of the <span className="text-accent italic">Schools</span>
          </h2>

          <p className="font-sans text-base sm:text-lg text-muted leading-relaxed">
            Battle of the Schools is a weekend hackathon between the University of Toronto and the University of Waterloo, hosted by UTMIST and WAT.ai. Teams from both schools build machine learning projects for thirty-six hours straight.
          </p>
          <p className="font-sans text-base sm:text-lg text-muted leading-relaxed">
            Whichever school scores highest across all of its teams takes the <span className="text-waterloo font-semibold animate-pulse">Maple Cup</span>.
          </p>
        </div>
      </div>
    </section>
  );
}
