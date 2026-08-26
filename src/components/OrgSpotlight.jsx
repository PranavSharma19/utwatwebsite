import { useState } from 'react';
import { BookOpen, GraduationCap, Compass, Users, Network, TrendingUp } from 'lucide-react';
import { useFaction } from '../faction/FactionContext';
import wataiLogoImg from '../assets/wat-ai-logo.avif';
import utmistLogoImg from '../assets/utmist-logo.png';
import utmistLogoWithTextImg from '../assets/utmist-logo-with-text.png';

export default function OrgSpotlight() {
  // Seeded from — and kept in step with — the one faction source, so a
  // visitor who picks WAT.ai in the hero does not scroll down to find the
  // Organizers section still showing UTMIST. The manual toggle below still
  // works and still wins until the faction changes again; this panel is a
  // browsable comparison, not a second way to pick a side, so it is
  // deliberately not writing back to FactionContext.
  //
  // Adjust-state-during-render rather than an effect: this repo's
  // eslint-plugin-react-hooks 7.x errors on react-hooks/set-state-in-effect,
  // and the effect version would also paint one frame of the wrong org.
  const { faction } = useFaction();
  const [activeOrg, setActiveOrg] = useState(faction ?? 'utmist'); // 'utmist' or 'watai'
  const [lastFaction, setLastFaction] = useState(faction);

  if (faction !== lastFaction) {
    setLastFaction(faction);
    if (faction) setActiveOrg(faction);
  }

  const utmistStats = [
    { label: 'AI/ML Projects', val: '60+', desc: 'Models built and shipped', icon: Compass },
    { label: 'Developers', val: '400+', desc: 'Students actively contributing', icon: Users },
    { label: 'Articles', val: '50+', desc: 'Articles published', icon: BookOpen },
    { label: 'Workshops', val: '25+', desc: 'Workshops run', icon: GraduationCap }
  ];

  const wataiStats = [
    { label: 'AI/ML Projects', val: '40+', desc: 'Projects with industry partners', icon: Compass },
    { label: 'Program Graduates', val: '450+', desc: 'Students through the program', icon: GraduationCap },
    { label: 'Articles & Notebooks', val: '20+', desc: 'Articles and notebooks', icon: BookOpen },
    { label: 'Active Partnerships', val: '12+', desc: 'Company partnerships', icon: Network }
  ];

  return (
    <section className="py-24 relative overflow-hidden" id="organizations">
      {/*
        Ambient glow, painted as a radial-gradient rather than a blurred div.
        A large blur() is a filter, and Safari rasterizes those lazily: it
        paints the element's unblurred SQUARE bounding box first and only
        applies the blur on the next repaint — which is why scrolling appeared
        to "fix" it. A gradient has no filter to rasterize.
      */}
      <div
        aria-hidden="true"
        className="absolute inset-0 z-0 pointer-events-none transition-[background] duration-700 ease-in-out"
        style={{
          background: `radial-gradient(46% 42% at 50% 50%, ${
            activeOrg === 'utmist' ? 'rgba(30, 55, 101, .55)' : 'rgba(253, 213, 79, .14)'
          } 0%, transparent 72%)`,
        }}
      />

      <div className="mx-auto max-w-container-max px-gutter relative z-10">

        {/* Header Brief */}
        <div className="text-center max-w-3xl mx-auto mb-16 space-y-4">
          <h2 className="font-display text-3xl sm:text-5xl font-black uppercase text-ink leading-tight">
            Our <span className="text-accent italic">Organizers</span>
          </h2>
          <p className="font-sans text-muted leading-relaxed">
            Run by the student AI clubs at Toronto and Waterloo, together.
          </p>
        </div>

        {/* Dynamic Dual-Tab System (Combines U of T Blue and Waterloo Gold) */}
        <div className="flex justify-center mb-12">
          <div className="relative flex rounded-full border border-signal/15 bg-panel/80 p-1.5">
            {/* Sliding backdrop */}
            <div
              className={`absolute top-1.5 bottom-1.5 left-1.5 w-[calc(50%-12px)] rounded-full transition-all duration-300 ease-out ${
                activeOrg === 'utmist'
                  ? 'translate-x-0 bg-panel border border-signal/60'
                  : 'translate-x-full bg-waterloo/10 border border-waterloo/60'
              }`}
            />

            <button
              onClick={() => setActiveOrg('utmist')}
              className={`relative z-10 px-8 py-3 rounded-full font-mono text-xs font-bold uppercase tracking-widest transition-colors duration-300 flex items-center justify-center ${
                activeOrg === 'utmist' ? 'text-signal' : 'text-muted hover:text-ink'
              }`}
            >
              <img src={utmistLogoImg} alt="UTMIST" className="h-5 w-auto object-contain" />
            </button>

            <button
              onClick={() => setActiveOrg('watai')}
              className={`relative z-10 px-8 py-3 rounded-full font-mono text-xs font-bold uppercase tracking-widest transition-colors duration-300 flex items-center justify-center ${
                activeOrg === 'watai' ? 'text-waterloo' : 'text-muted hover:text-ink'
              }`}
            >
              <img src={wataiLogoImg} alt="Waterloo AI" className="h-5 w-auto object-contain" />
            </button>
          </div>
        </div>

        {/* Dashboard Panels Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* Left Column: Organization Summary & Dynamic Stats (8 Columns) */}
          <div className="lg:col-span-8 space-y-8">
            
            {/* dynamic background panel card */}
            <div className={`rounded-3xl border p-8 sm:p-10 transition-all duration-500 ease-in-out ${
              activeOrg === 'utmist' ? 'bg-panel border-signal/15' : 'bg-waterloo/10 border-waterloo/15'
            }`}>

              {/* Org Introduction Title */}
              <div className="space-y-6">
                <div className="flex items-center gap-4">
                  <div>
                    <h3 className="font-display text-2xl sm:text-3xl font-black text-ink flex items-center">
                      {activeOrg === 'utmist' ? (
                        <img src={utmistLogoWithTextImg} alt="UTMIST" className="h-9 sm:h-11 w-auto object-contain" />
                      ) : (
                        <img src={wataiLogoImg} alt="Waterloo AI" className="h-9 sm:h-11 w-auto object-contain" />
                      )}
                    </h3>
                    <p className="font-mono text-xs uppercase tracking-widest text-muted">
                      {activeOrg === 'utmist' ? 'University of Toronto Community' : 'Waterloo Artificial Intelligence Club'}
                    </p>
                  </div>
                </div>

                <p className="font-sans text-base sm:text-lg text-muted leading-relaxed font-light">
                  {activeOrg === 'utmist'
                    ? "UTMIST is North America’s largest undergraduate AI/ML community! We run student-led projects, hands-on workshops, and flagship conferences and hackathons, making AI/ML accessible to everyone who’s curious and motivated."
                    : "Our goal is to establish an environment to enable the continued growth of AI talent and suitable access to opportunities within the Waterloo community. We provide opportunities for undergraduate and graduate students to engage in impactful projects through collaboration with companies and internal research."
                  }
                </p>
              </div>

              {/* Dynamic stats cards list */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-8 pt-8 border-t border-white/5">
                {(activeOrg === 'utmist' ? utmistStats : wataiStats).map((stat) => {
                  const Icon = stat.icon;
                  return (
                    <div key={stat.label} className="space-y-2">
                      {/*
                        The blue side takes the full token where the gold
                        side can afford /60. That asymmetry is the palette's,
                        not an oversight: `signal` is already a lightened
                        derivative of `uoft`, so a further 40% off drops it
                        to 3.37:1 on the bg-panel panel, while
                        text-waterloo/60 still measures 5.02:1 on its own
                        bg-waterloo/10 panel. Full text-signal is 6.90:1.
                      */}
                      <div className={`flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider ${
                        activeOrg === 'utmist' ? 'text-signal' : 'text-waterloo/60'
                      }`}>
                        <Icon size={12} className={activeOrg === 'utmist' ? 'text-signal' : 'text-waterloo'} />
                        {stat.label}
                      </div>

                      <div className={`font-mono text-2xl sm:text-3xl font-black tracking-tight leading-none ${
                        activeOrg === 'utmist' ? 'text-signal' : 'text-waterloo'
                      }`}>
                        {stat.val}
                      </div>

                      <p className="font-sans text-[10px] sm:text-xs text-muted leading-tight">{stat.desc}</p>
                    </div>
                  );
                })}
              </div>

            </div>



          </div>

          {/* Right Column: Social Media Reach Cards (4 Columns) */}
          <div className="lg:col-span-4 space-y-6">
            
            {/* Instagram Statistics Card */}
            <div className={`rounded-lg border p-6 hover:translate-y-[-2px] transition-all duration-300 ${
              activeOrg === 'utmist'
                ? 'bg-panel/80 border-signal/15'
                : 'bg-waterloo/22 border-waterloo/30'
            }`}>
              <div className="flex justify-between items-start mb-6">
                <div>
                  <span className="font-mono text-[9px] uppercase tracking-widest text-muted">Instagram</span>
                  <h4 className="font-display text-base font-bold text-ink mt-1">Community</h4>
                </div>
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center border ${
                  activeOrg === 'utmist'
                    ? 'bg-signal/10 text-signal border-signal/30'
                    : 'bg-waterloo/10 text-waterloo border-waterloo/40'
                }`}>
                  <TrendingUp size={18} />
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-baseline gap-2">
                  <span className={`font-mono text-3xl font-black ${
                    activeOrg === 'utmist' ? 'text-ink' : 'text-waterloo'
                  }`}>
                    {activeOrg === 'utmist' ? '5,400+' : '1,600+'}
                  </span>
                  <span className="font-sans text-xs text-muted">followers</span>
                </div>


              </div>
            </div>

            {/* LinkedIn Statistics Card */}
            <div className={`rounded-lg border p-6 hover:translate-y-[-2px] transition-all duration-300 ${
              activeOrg === 'utmist'
                ? 'bg-panel/80 border-signal/15'
                : 'bg-waterloo/22 border-waterloo/30'
            }`}>
              <div className="flex justify-between items-start mb-6">
                <div>
                  <span className="font-mono text-[9px] uppercase tracking-widest text-muted">LinkedIn</span>
                  <h4 className="font-display text-base font-bold text-ink mt-1">Network</h4>
                </div>
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center border ${
                  activeOrg === 'utmist'
                    ? 'bg-signal/10 text-signal border-signal/30'
                    : 'bg-waterloo/10 text-waterloo border-waterloo/40'
                }`}>
                  <TrendingUp size={18} />
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-baseline gap-2">
                  <span className={`font-mono text-3xl font-black ${
                    activeOrg === 'utmist' ? 'text-ink' : 'text-waterloo'
                  }`}>
                    {activeOrg === 'utmist' ? '3,600+' : '2,000+'}
                  </span>
                  <span className="font-sans text-xs text-muted">subscribers</span>
                </div>


              </div>
            </div>



          </div>

        </div>

        {/* Tug-of-war: territory, not a scoreboard */}
        <div className="mt-16">
        </div>

      </div>
    </section>
  );
}
