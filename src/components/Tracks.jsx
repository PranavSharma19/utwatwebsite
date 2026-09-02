import { Bot, Globe, HeartPulse } from 'lucide-react';

// Three parallel tracks — not a sequence, so no 01/02/03 numbering. Each is
// identified by its domain icon. Prize places ARE a real ordinal, so the rank
// markers carry gold/blue/bronze tones; the top prize is the one bold accent
// in an otherwise quiet card.
const RANK_TONE = {
  gold: 'border-waterloo/40 bg-waterloo/10 text-waterloo',
  blue: 'border-signal/40 bg-signal/10 text-signal',
  bronze: 'border-white/10 bg-white/5 text-muted',
};

const TRACKS = [
  {
    name: 'Robotics',
    icon: Bot,
    partner: 'with BracketBot',
    blurb: "Build the best use of BracketBot's brand-new generation of robots.",
    prizes: [
      {
        place: '1st – 3rd',
        tone: 'gold',
        items: ['A Bambu Lab printer for every member of the top three teams'],
      },
    ],
  },
  {
    name: 'Web Agents',
    icon: Globe,
    partner: 'with Steel.Dev',
    blurb: 'Build creative AI solutions powered by browser use.',
    prizes: [
      {
        place: '1st',
        tone: 'gold',
        items: ['$1,000 cash', '$600 in Steel Computer credits', '$500 in OpenRouter credits'],
      },
      { place: '2nd', tone: 'blue', items: ['Gaming gear', '$300 in Steel Pro credits'] },
      { place: '3rd', tone: 'bronze', items: ['JBL speakers', '$100 in Steel Pro credits'] },
    ],
  },
  {
    name: 'Healthcare',
    icon: HeartPulse,
    partner: null,
    blurb: 'Build AI solutions for real problems in healthcare.',
    prizes: [
      { place: '1st', tone: 'gold', items: ['Keychron V1 Max mechanical keyboard'] },
      { place: '2nd', tone: 'blue', items: ['Logitech G305 wireless mouse'] },
      { place: '3rd', tone: 'bronze', items: ['Anker 10,000mAh power bank'] },
    ],
  },
];

export default function Tracks() {
  return (
    <section className="py-24 relative overflow-hidden" id="tracks">
      {/* Ambient accent glow — same radial-gradient approach as the other sections,
          which avoids Safari's lazy blur rasterization. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 z-0 pointer-events-none"
        style={{ background: 'radial-gradient(44% 40% at 50% 0%, rgb(var(--accent-rgb) / .10) 0%, transparent 70%)' }}
      />

      <div className="mx-auto max-w-container-max px-gutter relative z-10">
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto mb-16 space-y-4">
          <span className="font-mono text-xs font-bold uppercase tracking-widest text-accent">
            Compete
          </span>
          <h2 className="font-display text-3xl sm:text-5xl font-black uppercase text-ink leading-tight">
            Choose your <span className="text-accent italic">Track</span>
          </h2>
          <p className="font-sans text-muted leading-relaxed">
            Three tracks, each with its own prizes. Pick one and build.
          </p>
        </div>

        {/* Track cards */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-stretch">
          {TRACKS.map((track) => {
            const Icon = track.icon;
            return (
              <div
                key={track.name}
                className="flex flex-col rounded-3xl border border-signal/15 bg-panel/60 p-8 transition-all duration-300 hover:-translate-y-1 hover:border-accent/30"
              >
                {/* Domain badge */}
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-accent/20 bg-accent/10 text-accent">
                  <Icon size={22} />
                </div>

                {/* Name + blurb */}
                <div className="mt-6 space-y-2">
                  <h3 className="font-display text-2xl font-black uppercase tracking-tight text-ink">
                    {track.name}
                  </h3>
                  {track.partner && (
                    <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-muted">
                      {track.partner}
                    </p>
                  )}
                </div>
                <p className="mt-3 font-sans text-base text-muted leading-relaxed">
                  {track.blurb}
                </p>

                {/* Prizes */}
                <div className="mt-8 pt-6 border-t border-white/5">
                  <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-muted/70">
                    Prizes
                  </span>
                  <ul className="mt-4 space-y-4">
                    {track.prizes.map((prize) => (
                      <li key={prize.place} className="flex gap-3">
                        <span
                          className={`shrink-0 rounded-md border px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-wider ${RANK_TONE[prize.tone]}`}
                        >
                          {prize.place}
                        </span>
                        <span className="font-sans text-sm text-ink/90 leading-relaxed">
                          {prize.items.join(' · ')}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
