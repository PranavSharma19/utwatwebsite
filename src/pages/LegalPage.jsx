import { Fragment } from 'react';
import { Link } from 'react-router-dom';
import Starfield from '../components/Starfield';
import Footer from '../components/Footer';
import { portalConfig } from '../admissions/portalConfig';

// Longest first, so '/code-of-conduct' is matched whole rather than by a
// shorter route that happens to prefix it.
const POLICY_ROUTES = Object.values(portalConfig.policyLinks).sort(
  (a, b) => b.length - a.length,
);
const ROUTE_RE = new RegExp(
  `(${POLICY_ROUTES.map((r) => r.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`,
  'g',
);

/**
 * One document referring to another is the whole point of a policy set: the
 * waiver binds acceptors to the code of conduct, and someone reading it needs
 * to get there. The content is plain strings, so rather than give every
 * paragraph a markup format, any policy route written in the prose becomes a
 * real link. A bare "/code-of-conduct" sitting in a sentence is not something
 * a reader can act on.
 */
function withLinks(text) {
  const parts = text.split(ROUTE_RE);
  if (parts.length === 1) return text;
  return parts.map((part, i) =>
    POLICY_ROUTES.includes(part) ? (
      // eslint-disable-next-line react/no-array-index-key
      <Link className="text-accent underline" key={i} to={part}>
        {part}
      </Link>
    ) : (
      // eslint-disable-next-line react/no-array-index-key
      <Fragment key={i}>{part}</Fragment>
    ),
  );
}

/**
 * Renders either legal document. Both have the same shape, so they share a
 * page rather than duplicating a layout that would drift apart.
 *
 * Deliberately plain: this is the one part of the site somebody reads to find
 * a specific fact, usually because they are worried about something. Long
 * measure, real paragraph spacing, no animation, no reveal gate.
 */
export default function LegalPage({ document: doc }) {
  return (
    <div className="min-h-screen bg-transparent font-sans text-on-surface">
      <Starfield />

      <div className="relative z-10 flex min-h-screen flex-col">
        <main className="flex-grow px-gutter py-16 sm:py-24">
          <article className="mx-auto max-w-2xl">
            <Link
              to="/"
              className="font-mono text-[10px] uppercase tracking-[.25em] text-muted transition-colors hover:text-accent"
            >
              &larr; Back to Battle of the Schools
            </Link>

            <h1 className="mt-8 font-display text-4xl font-black uppercase tracking-tight text-ink sm:text-5xl">
              {doc.title}
            </h1>
            <p className="mt-3 font-mono text-[10px] uppercase tracking-[.2em] text-muted">
              Last updated{' '}
              <time dateTime={doc.updated}>
                {new Intl.DateTimeFormat('en-CA', {
                  dateStyle: 'long',
                  timeZone: 'UTC',
                }).format(new Date(`${doc.updated}T12:00:00Z`))}
              </time>
            </p>

            {doc.intro.map((paragraph) => (
              <p
                key={paragraph.slice(0, 40)}
                className="mt-5 text-[15px] leading-relaxed text-on-surface-variant"
              >
                {withLinks(paragraph)}
              </p>
            ))}

            {doc.sections.map((section) => (
              <section key={section.heading} className="mt-12">
                <h2 className="font-display text-xl font-bold uppercase tracking-wide text-ink">
                  {section.heading}
                </h2>
                {section.paragraphs.map((paragraph) => (
                  <p
                    key={paragraph.slice(0, 40)}
                    className="mt-4 text-[15px] leading-relaxed text-on-surface-variant"
                  >
                    {withLinks(paragraph)}
                  </p>
                ))}
                {section.bullets && (
                  <ul className="mt-4 space-y-2 pl-5">
                    {section.bullets.map((bullet) => (
                      <li
                        key={bullet.slice(0, 40)}
                        className="list-disc text-[15px] leading-relaxed text-on-surface-variant marker:text-accent"
                      >
                        {withLinks(bullet)}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ))}
          </article>
        </main>

        <Footer />
      </div>
    </div>
  );
}
