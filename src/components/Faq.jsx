import { useState } from 'react';
import { ChevronDown } from 'lucide-react';

export default function Faq() {
  const [expandedIndex, setExpandedIndex] = useState(null);

  const faqData = [
    {
      q: 'What is a hackathon?',
      a: "A weekend where teams build something working from nothing. You start Friday, you demo on Sunday, and most of what you learn happens somewhere in between."
    },
    {
      q: 'Who can attend the Battle?',
      a: "Undergrad and grad students at any university. You don't need to be in computer science, and you don't need to have done one before."
    },
    {
      q: 'Do I need to know how to code to join?',
      a: "It helps, but no. Teams also need designers, people who actually understand the problem they're solving, and someone keeping the thing on track. Come anyway."
    },
    {
      q: 'How do team sizes and registration work?',
      a: "Teams are 2 to 4 people. Register with a team or on your own — there's a team-forming session at the opening ceremony if you show up without one."
    },
    {
      q: 'What resources will be provided during the weekend?',
      a: "Cloud compute, model APIs, robotics simulators, mentors from the sponsor companies, and food all weekend."
    }
  ];

  const handleToggle = (index) => {
    setExpandedIndex(expandedIndex === index ? null : index);
  };

  return (
    <section className="py-24 relative overflow-hidden" id="faq">
      <div className="mx-auto max-w-3xl px-gutter relative z-10">

        <div className="text-center mb-16 space-y-4">
          <h2 className="font-display text-3xl sm:text-5xl font-black uppercase text-ink leading-tight">
            Frequently Asked <span className="text-accent italic">Questions</span>
          </h2>
          <p className="font-sans text-muted leading-relaxed">
            Have questions? We've got answers. Review our frequently asked questions below.
          </p>
        </div>

        {/* Accordions Container */}
        <div className="space-y-4">
          {faqData.map((faq, i) => {
              const isOpen = expandedIndex === i;
              return (
                <div
                  key={i}
                  className={`rounded-lg border transition-all duration-300 overflow-hidden ${
                    isOpen ? 'border-accent/60 bg-panel/80' : 'border-signal/15 bg-panel/80'
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
          })}
        </div>

      </div>
    </section>
  );
}
