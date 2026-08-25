import { useState, useEffect } from "react";
import { Menu, X, ArrowRight } from "lucide-react";
import wataiLogoImg from "../assets/wat-ai-logo.avif";
import utmistLogoWithTextImg from "../assets/utmist-logo-with-text.png";

const NAV_LINKS = [
  { name: "About", href: "#about" },
  // { name: 'Mission', href: '#missions' },
  { name: "Organizers", href: "#organizations" },
  { name: "Sponsors", href: "#sponsors" },
  { name: "FAQ", href: "#faq" },
];

export default function Navbar() {
  const [isOpen, setIsOpen] = useState(false);
  const [activeSection, setActiveSection] = useState("");

  useEffect(() => {
    const handleScroll = () => {
      const scrollPosition = window.scrollY + 120; // Offset for header height

      for (const link of NAV_LINKS) {
        const el = document.querySelector(link.href);
        if (el) {
          const top = el.offsetTop;
          const height = el.offsetHeight;
          if (scrollPosition >= top && scrollPosition < top + height) {
            setActiveSection(link.href);
            return;
          }
        }
      }

      // Default to empty if at top
      if (window.scrollY < 200) {
        setActiveSection("");
      }
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const handleNavClick = (e, href) => {
    e.preventDefault();
    setIsOpen(false);
    if (href === "#") {
      window.scrollTo({
        top: 0,
        behavior: "smooth",
      });
      return;
    }

    const target = document.querySelector(href);
    if (target) {
      const headerOffset = 80;
      const elementPosition = target.getBoundingClientRect().top;
      const offsetPosition = elementPosition + window.scrollY - headerOffset;

      window.scrollTo({
        top: offsetPosition,
        behavior: "smooth",
      });
    }
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b border-accent/10 bg-void/50 shadow-lg shadow-black/20 transition-all duration-300">
      <div className="mx-auto flex h-20 max-w-container-max items-center justify-between px-gutter">
        {/* Brand Logo - Styled in Sagburn display font with dynamic cyber gold glow */}
        <a
          href="#"
          onClick={(e) => handleNavClick(e, "#")}
          className="flex items-center gap-2 sm:gap-3.5 hover:opacity-90 transition-opacity group"
        >
          {/* UTMIST x Wat.ai Logos on the left */}
          <div className="flex items-center gap-2.5">
            <img
              src={utmistLogoWithTextImg}
              alt="UTMIST"
              className="h-6 sm:h-8 w-auto object-contain"
            />
            <span className="text-ink/20 text-[10px] font-mono font-bold select-none">
              x
            </span>
            <img
              src={wataiLogoImg}
              alt="Wat.ai"
              className="h-6 sm:h-8 w-auto object-contain"
            />
          </div>

          <span className="text-ink/10 font-light select-none hidden sm:block">
            |
          </span>

          <span className="font-display text-sm sm:text-2xl font-black tracking-tighter text-ink">
            BATTLE OF THE{" "}
            <span className="italic text-accent">SCHOOLS</span>
          </span>
        </a>

        {/* Desktop Nav Links */}
        <nav className="hidden md:flex items-center gap-6">
          {NAV_LINKS.map((link) => {
            const isActive = activeSection === link.href;
            return (
              <a
                key={link.name}
                href={link.href}
                onClick={(e) => handleNavClick(e, link.href)}
                className={`relative px-3 py-2 text-sm font-medium tracking-wide uppercase transition-all duration-300 rounded-lg hover:bg-accent/5 ${
                  isActive
                    ? "text-accent"
                    : "text-muted hover:text-ink"
                }`}
              >
                {link.name}
                {isActive && (
                  <span className="absolute bottom-0 left-3 right-3 h-[2px] bg-accent rounded-full" />
                )}
              </a>
            );
          })}

          <a
            href="/apply"
            className="group relative flex items-center gap-2 overflow-hidden rounded-full bg-accent px-6 py-2.5 text-xs font-bold uppercase tracking-wider text-accent-ink transition-all duration-300 hover:scale-[1.03] active:scale-[0.98]"
          >
            <span className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity" />
            Apply
            <ArrowRight
              size={14}
              className="relative z-10 text-accent-ink"
            />
          </a>
        </nav>

        {/* Mobile Menu Toggle Button */}
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex h-10 w-10 items-center justify-center rounded-lg border border-accent/20 bg-accent/5 text-accent hover:bg-accent/10 md:hidden transition-colors"
          aria-label="Toggle Menu"
        >
          {isOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {/* Mobile Nav Overlay */}
      {isOpen && (
        <div className="absolute top-20 left-0 right-0 border-b border-accent/10 bg-void/95 p-6 md:hidden shadow-2xl animate-fadeIn">
          <div className="flex flex-col gap-4">
            {NAV_LINKS.map((link) => {
              const isActive = activeSection === link.href;
              return (
                <a
                  key={link.name}
                  href={link.href}
                  onClick={(e) => handleNavClick(e, link.href)}
                  className={`flex items-center justify-between px-4 py-3 rounded-xl text-sm font-semibold tracking-wider uppercase transition-all duration-200 ${
                    isActive
                      ? "bg-accent/10 border-l-4 border-accent text-accent"
                      : "text-muted hover:text-ink hover:bg-white/5"
                  }`}
                >
                  {link.name}
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${isActive ? "bg-accent" : "bg-transparent"}`}
                  />
                </a>
              );
            })}

            <a
              href="/apply"
              onClick={() => setIsOpen(false)}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-accent py-4 text-center text-sm font-bold uppercase tracking-wider text-accent-ink"
            >
              Apply
              <ArrowRight size={16} className="text-accent-ink" />
            </a>
          </div>
        </div>
      )}
    </header>
  );
}
