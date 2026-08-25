export default function About() {
  return (
    <section className="py-24 relative overflow-hidden" id="about">
      {/* Decorative gradients */}
      <div className="absolute top-1/2 left-0 h-[300px] w-[300px] -translate-y-1/2 rounded-full bg-accent/5 blur-[100px] pointer-events-none" />

      <div className="mx-auto max-w-container-max px-gutter relative z-10">

        {/* Core Description block */}
        <div className="max-w-4xl space-y-6">
          <h2 className="font-display text-3xl sm:text-5xl font-black uppercase tracking-tight text-ink leading-tight">
            Battle of the <span className="text-accent italic">Schools</span>
          </h2>

          <p className="font-sans text-base sm:text-lg text-muted leading-relaxed">
            The Battle of the Schools is an elite hackathon engineered to ignite school spirit by pitting young machine learning engineers and AI researchers against each other in a friendly, weekend-long competition.
          </p>
          <p className="font-sans text-base sm:text-lg text-muted leading-relaxed">
            At the closing ceremony, the university that secures the highest total points across all its participating teams will claim the ultimate bragging rights and take home the coveted <span className="text-waterloo font-semibold animate-pulse">Maple Cup</span>.
          </p>
        </div>
      </div>
    </section>
  );
}
