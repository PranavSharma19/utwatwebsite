import { Flame, Construction, Bot } from 'lucide-react';

export default function About() {
  const objectiveCards = [
    {
      title: 'Ignite School Spirit',
      desc: 'Create a rivalry-fueled environment where students compete not just for cash, but for the glory of their institution.',
      icon: Flame,
      glowClass: 'hover:border-amber-500/40 hover:shadow-[0_0_20px_rgba(251,191,36,0.15)] hover:bg-amber-500/5',
      iconBg: 'bg-amber-500/10 text-amber-400 border border-amber-500/20',
    },
    {
      title: 'Empower Builders',
      desc: 'Remove barriers to entry by providing powerful resources, including high-compute APIs, cloud tokens, and advanced robotics hardware.',
      icon: Construction,
      glowClass: 'hover:border-accent/40 hover:bg-accent/5',
      iconBg: 'bg-accent/10 text-accent border border-accent/20',
    },
    {
      title: 'Build a Community',
      desc: 'Provide an exceptional venue for students, design teams, researchers, and builders from different institutions to network and collaborate.',
      icon: Bot,
      glowClass: 'hover:border-cyan-500/40 hover:shadow-[0_0_20px_rgba(6,182,212,0.15)] hover:bg-cyan-500/5',
      iconBg: 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20',
    }
  ];

  return (
    <section className="py-24 relative overflow-hidden" id="about">
      {/* Decorative gradients */}
      <div className="absolute top-1/2 left-0 h-[300px] w-[300px] -translate-y-1/2 rounded-full bg-accent/5 blur-[100px] pointer-events-none" />

      <div className="mx-auto max-w-container-max px-gutter relative z-10">

        {/* Core Description block */}
        <div className="max-w-4xl mb-16 space-y-6">
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

        {/* 3 Core Cards with customized interactive glows */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6" id="missions">
          {objectiveCards.map((card, i) => {
            const Icon = card.icon;
            return (
              <div
                key={card.title}
                className={`border border-signal/15 bg-uoft/20 rounded-lg p-8 flex flex-col justify-between h-full transition-all duration-300 ${card.glowClass}`}
              >
                <div className="space-y-6">
                  <div className="flex justify-between items-center">
                    <span className="font-mono text-xs text-accent/30">GOAL 0{i + 1}</span>
                    <span className="h-1.5 w-1.5 rounded-full bg-accent/30" />
                  </div>

                  {/* Styled Icon */}
                  <div className={`w-14 h-14 rounded-xl flex items-center justify-center ${card.iconBg}`}>
                    <Icon size={24} />
                  </div>

                  <h3 className="font-display text-xl font-bold text-ink tracking-wide">{card.title}</h3>
                  <p className="font-sans text-sm text-muted leading-relaxed">{card.desc}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
