import { Mail, Globe, Sparkles } from "lucide-react";
import { sponsors } from "../data/sponsors";

export default function Sponsors() {
  return (
    <section className="py-24 relative overflow-hidden" id="sponsors">
      {/* Dynamic ambient graphic */}
      <div className="absolute bottom-0 left-1/4 h-[300px] w-[300px] rounded-full bg-secondary-container/5 blur-[100px] pointer-events-none" />

      <div className="mx-auto max-w-container-max px-gutter relative z-10">
        <div className="text-center max-w-3xl mx-auto mb-16 space-y-4">
          <div className="inline-block px-3 py-1 rounded-md border border-primary/10 bg-primary/5 text-primary text-xs font-mono uppercase tracking-widest font-bold">
            03 // SPONSORS
          </div>
          <h2 className="font-display text-3xl sm:text-5xl font-black uppercase text-white leading-tight">
            Our <span className="text-primary italic">Sponsors</span>
          </h2>
          <p className="font-sans text-on-surface-variant leading-relaxed">
            The industry leaders driving machine learning innovation and funding
            the next generation of builders.
          </p>
        </div>

        {/* Sponsor Banner Box */}
        <div className="glass-panel p-8 sm:p-12 rounded-3xl border border-primary/10 bg-surface-container-lowest/80 backdrop-blur-2xl">
          {/* Flat wall - every sponsor gets the same footprint. `justify-center`
              centers the final short row rather than leaving a hole in a grid. */}
          <ul className="flex flex-wrap justify-center gap-4 sm:gap-6 list-none p-0 m-0">
            {sponsors.map((sponsor) => (
              <li
                key={sponsor.name}
                className="basis-[calc(50%-0.5rem)] sm:basis-[calc(33.333%-1rem)] max-w-[300px]"
              >
                <a
                  href={sponsor.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`${sponsor.name} - visit website`}
                  className="group relative bg-white/95 p-6 sm:p-8 rounded-2xl flex items-center justify-center h-32 sm:h-36 shadow-xl transition-all duration-300 hover:scale-105 hover:border-primary/40 hover:shadow-[0_0_30px_rgba(184,195,255,0.18)] border border-transparent"
                >
                  <img
                    alt={`${sponsor.name} logo`}
                    src={sponsor.logo}
                    loading="lazy"
                    className="w-auto max-w-full object-contain pointer-events-none"
                    style={{ maxHeight: `${3.25 * (sponsor.logoScale ?? 1)}rem` }}
                  />

                  {/* Micro interactive indicator */}
                  <span className="absolute bottom-3 right-3 flex items-center gap-1 text-[8px] font-mono text-gray-400 uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity">
                    <Globe size={8} /> Visit Site
                  </span>
                </a>
              </li>
            ))}
          </ul>

          <div className="mt-16 text-center space-y-4">
            <p className="font-mono text-xs text-on-surface-variant uppercase tracking-[0.25em] flex items-center justify-center gap-2">
              <Sparkles
                size={14}
                className="text-secondary-fixed animate-spin"
                style={{ animationDuration: "4s" }}
              />
              Interested in sponsoring?
            </p>
            <div>
              <a
                href="mailto:r342shar@uwaterloo.ca"
                className="group inline-flex items-center gap-2 px-8 py-3.5 rounded-full border border-primary/30 text-sm font-bold uppercase tracking-wider text-primary hover:border-primary hover:bg-primary/5 transition-all duration-300"
              >
                <Mail
                  size={16}
                  className="text-primary-fixed-dim group-hover:animate-bounce"
                />
                Become a Partner
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
