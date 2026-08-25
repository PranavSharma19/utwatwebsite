import { useState } from 'react';
import { ChevronDown, Search, Info } from 'lucide-react';

export default function Faq() {
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedIndex, setExpandedIndex] = useState(null);

  const faqData = [
    {
      q: 'What is a hackathon?',
      a: "A hackathon is an intense, multi-day engineering event where students collaborate in teams to build functional software or hardware projects from scratch. It is about rapid prototyping, intense learning, and pushing cognitive boundaries in real-time."
    },
    {
      q: 'Who can attend the Battle?',
      a: "The Battle of the Schools is primarily open to undergraduate and graduate students currently enrolled in university programs. We welcome developers, designers, product strategists, and AI researchers of all skill levels."
    },
    {
      q: 'Do I need to know how to code to join?',
      a: "While coding is a core part of building functional AI prototypes, successful teams also need talented UI/UX designers, domain experts (chemists, physicists, health analysts), and project orchestrators. If you are passionate about ML applications, there is a place for you in the arena."
    },
    {
      q: 'How do team sizes and registration work?',
      a: "Teams typically consist of 2 to 4 members. You can register with a pre-made team or easily find compatible teammates during our interactive networking sessions at the official opening ceremony."
    },
    {
      q: 'What resources will be provided during the weekend?',
      a: "Builders will receive massive developer enablement packages: cloud compute instances, pre-trained AI foundation weights, APIs, robotics simulators, high-compute tokens, on-site mentorship from elite industry teams, and plenty of premium catered food to fuel your build."
    }
  ];

  const handleToggle = (index) => {
    setExpandedIndex(expandedIndex === index ? null : index);
  };

  const filteredFaqs = faqData.filter(
    (faq) => 
      faq.q.toLowerCase().includes(searchTerm.toLowerCase()) || 
      faq.a.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <section className="py-24 relative overflow-hidden bg-uoft/20" id="faq">
      <div className="mx-auto max-w-3xl px-gutter relative z-10">

        <div className="text-center mb-16 space-y-4">
          <h2 className="font-display text-3xl sm:text-5xl font-black uppercase text-ink leading-tight">
            Frequently Asked <span className="text-accent italic">Questions</span>
          </h2>
          <p className="font-sans text-muted leading-relaxed">
            Have questions? We've got answers. Review our frequently asked questions below.
          </p>
        </div>

        {/* Real-time Interactive Filter Search bar */}
        <div className="relative mb-8 max-w-md mx-auto">
          <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-accent/55">
            <Search size={18} />
          </div>
          <input
            type="text"
            placeholder="SEARCH FAQ..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-12 pr-4 py-4 rounded-xl border border-signal/15 bg-uoft/20 font-mono text-xs text-ink uppercase placeholder-muted tracking-wider focus:outline-none focus:border-accent/70 focus:ring-2 focus:ring-accent/70 transition-all duration-300"
          />
        </div>

        {/* Accordions Container */}
        <div className="space-y-4">
          {filteredFaqs.length > 0 ? (
            filteredFaqs.map((faq, i) => {
              const isOpen = expandedIndex === i;
              return (
                <div
                  key={i}
                  className={`rounded-lg border transition-all duration-300 overflow-hidden ${
                    isOpen ? 'border-accent/60 bg-uoft/20' : 'border-signal/15 bg-uoft/20'
                  }`}
                >
                  <button
                    onClick={() => handleToggle(i)}
                    className="w-full p-6 text-left flex justify-between items-center group transition-colors duration-200"
                  >
                    <span className={`font-display text-sm sm:text-base font-bold transition-colors ${
                      isOpen ? 'text-accent' : 'text-ink group-hover:text-accent'
                    }`}>
                      {faq.q}
                    </span>
                    <span className={`text-accent transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}>
                      <ChevronDown size={20} />
                    </span>
                  </button>

                  {/* Smooth height transition panel */}
                  <div className={`transition-all duration-300 ease-in-out ${
                    isOpen ? 'max-h-[300px] border-t border-white/5 opacity-100 p-6' : 'max-h-0 opacity-0'
                  }`}>
                    <p className="font-sans text-xs sm:text-sm text-muted leading-relaxed font-light">
                      {faq.a}
                    </p>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="p-8 text-center rounded-lg border border-rose-500/10 bg-rose-950/5 flex flex-col items-center gap-3">
              <Info className="text-rose-400" size={24} />
              <p className="font-mono text-xs uppercase tracking-widest text-rose-300">
                NO QUESTIONS MATCH YOUR SEARCH
              </p>
              <button
                onClick={() => setSearchTerm('')}
                className="font-mono text-[10px] text-accent uppercase underline hover:text-ink"
              >
                Clear Search Filter
              </button>
            </div>
          )}
        </div>

      </div>
    </section>
  );
}
