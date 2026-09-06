import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  codeOfConduct,
  legalDocuments,
  participantWaiver,
  privacyPolicy,
  termsOfService,
} from './legalContent';
import { portalConfig } from '../admissions/portalConfig';
import LegalPage from '../pages/LegalPage';

const renderDoc = (doc) =>
  render(
    <MemoryRouter>
      <Routes>
        <Route path="/" element={<LegalPage document={doc} />} />
      </Routes>
    </MemoryRouter>,
  );

describe('legal documents', () => {
  it('both render their title and every section heading', () => {
    for (const doc of legalDocuments) {
      const { unmount } = renderDoc(doc);
      expect(
        screen.getByRole('heading', { level: 1, name: doc.title }),
      ).toBeInTheDocument();
      for (const section of doc.sections) {
        expect(
          screen.getByRole('heading', { level: 2, name: section.heading }),
        ).toBeInTheDocument();
      }
      unmount();
    }
  });

  // A route written into the prose has to be reachable. Before this, the
  // waiver's pointer at the code of conduct rendered as the literal text
  // "/code-of-conduct" -- correct, and useless to a reader.
  it('turns a policy route in the prose into a real link', () => {
    renderDoc(participantWaiver);
    const link = screen.getByRole('link', {
      name: portalConfig.policyLinks.codeOfConduct,
    });
    expect(link).toHaveAttribute(
      'href',
      portalConfig.policyLinks.codeOfConduct,
    );
  });

  // The rendered documents use em dashes; a literal double hyphen is the
  // repo's *comment* style leaking into prose a participant reads.
  it('uses em dashes in prose, not double hyphens', () => {
    for (const doc of legalDocuments) {
      const prose = [
        ...doc.intro,
        ...doc.sections.flatMap((s) => [...s.paragraphs, ...(s.bullets ?? [])]),
      ];
      for (const text of prose) {
        expect(text, `in ${doc.slug}`).not.toContain(' -- ');
      }
    }
  });

  it('carries a machine-readable last-updated date', () => {
    for (const doc of legalDocuments) {
      expect(doc.updated).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Number.isNaN(Date.parse(doc.updated))).toBe(false);
    }
  });

  /**
   * A policy that names a stale address is worse than one that names none:
   * someone exercising a privacy right writes to it and hears nothing back.
   */
  it('routes every contact instruction to the configured address', () => {
    const text = JSON.stringify(legalDocuments);
    expect(text).toContain(portalConfig.contactEmail);
    const addresses = text.match(/[\w.+-]+@[\w.-]+\.\w+/g) ?? [];
    for (const address of addresses) {
      expect(address).toBe(portalConfig.contactEmail);
    }
  });

  it('states the event dates the rest of the site advertises', () => {
    expect(JSON.stringify(legalDocuments)).toContain(portalConfig.eventDateRange);
  });
});

describe('privacy policy accuracy', () => {
  const text = JSON.stringify(privacyPolicy).toLowerCase();

  it('discloses every processor the site actually talks to', () => {
    for (const processor of ['supabase', 'vercel', 'cloudflare', 'google']) {
      expect(text).toContain(processor);
    }
  });

  /**
   * The poll used to store SHA-256(ip | day | salt) to dedupe by address.
   * That column is gone, so the policy must not still describe one -- and the
   * claim that replaced it ("no identifier of any kind") is a stronger promise
   * than the one it replaced, so it is worth pinning.
   */
  it('states that a vote carries no identifier, and does not describe one', () => {
    expect(text).toContain('no identifier of any kind is stored');
    expect(text).toMatch(/not your ip address, not a hash of it/);
    expect(text).toMatch(/does not store it/);
  });

  /**
   * The claim above is about server behaviour, which no front-end test can
   * see. This reads the Edge Function and the migrations instead: if a
   * per-visitor identifier is ever reintroduced for the poll, the policy
   * becomes false and this fails.
   */
  it('the vote endpoint really stores no per-visitor identifier', () => {
    const fn = readFileSync(
      join('supabase', 'functions', 'faction-cheer', 'index.ts'),
      'utf8',
    );
    expect(fn).not.toContain('visitor_hash');
    expect(fn).not.toContain('hashVisitor');
    expect(fn).not.toContain('CHEER_HASH_SALT');

    // And the column is actually gone, not merely unused by the function.
    const migrations = join('supabase', 'migrations');
    const combined = readdirSync(migrations)
      .filter((f) => f.endsWith('.sql'))
      .sort()
      .map((f) => readFileSync(join(migrations, f), 'utf8'))
      .join('\n');
    expect(combined).toMatch(/drop column if exists visitor_hash/);
  });

  it('covers the browser storage the site sets', () => {
    // factionStorage is the only thing this site writes to the browser.
    expect(text).toMatch(/browser/);
    expect(text).toMatch(/clear/);
  });

  it('warns that teammate emails are someone else\'s data', () => {
    expect(text).toContain('teammate');
  });

  /**
   * The policy claims outright that this site runs no analytics or tracking.
   * That is true today and is a promise to visitors, so it is enforced here:
   * adding any of these makes the claim a lie and fails the build instead.
   */
  it('the "no analytics" claim is still true of the codebase', () => {
    expect(text).toContain('no analytics');

    const TRACKERS = [
      'gtag(', 'googletagmanager', 'google-analytics',
      'plausible', 'posthog', 'mixpanel', 'amplitude',
      '@vercel/analytics', '@vercel/speed-insights', 'hotjar', 'segment.com',
    ];

    const offenders = [];
    const walk = (dir) => {
      for (const entry of readdirSync(dir)) {
        if (entry === 'node_modules' || entry.startsWith('.')) continue;
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) { walk(full); continue; }
        if (!/\.(jsx?|tsx?|html)$/.test(entry)) continue;
        if (full.includes('legalContent')) continue; // names them to forbid them
        const body = readFileSync(full, 'utf8').toLowerCase();
        for (const t of TRACKERS) if (body.includes(t)) offenders.push(`${full} -> ${t}`);
      }
    };
    walk('src');
    const html = readFileSync('index.html', 'utf8').toLowerCase();
    for (const t of TRACKERS) if (html.includes(t)) offenders.push(`index.html -> ${t}`);

    const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
    const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
    for (const d of deps) {
      if (TRACKERS.some((t) => d.includes(t.replace('(', '')))) offenders.push(`dependency -> ${d}`);
    }

    expect(offenders, 'privacy policy promises no analytics').toEqual([]);
  });
});

describe('policy links', () => {
  it('are wired up rather than left blank', () => {
    expect(portalConfig.policyLinks.privacy).toBe(`/${privacyPolicy.slug}`);
    expect(portalConfig.policyLinks.terms).toBe(`/${termsOfService.slug}`);
  });

  // The empty strings were the original bug: the form demanded consent to a
  // policy that had no page behind it.
  it('point at routes the app actually serves', () => {
    const app = readFileSync(join('src', 'App.jsx'), 'utf8');
    expect(app).toContain(`path="${portalConfig.policyLinks.privacy}"`);
    expect(app).toContain(`path="${portalConfig.policyLinks.terms}"`);
  });

  it('are reachable from the footer', () => {
    const footer = readFileSync(
      join('src', 'components', 'Footer.jsx'),
      'utf8',
    );
    expect(footer).toContain('policyLinks.privacy');
    expect(footer).toContain('policyLinks.terms');
  });

  it('are reachable from the consent checkbox that requires them', () => {
    const form = readFileSync(
      join('src', 'admissions', 'ApplicationForm.jsx'),
      'utf8',
    );
    expect(form).toContain('policyLinks.privacy');
  });

  // policyLinks.codeOfConduct was '' for most of this site's life. An empty
  // route string is not a missing feature that shows up as a broken link --
  // <Link to=""> renders as a link to the current page, and <Route path="">
  // matches nothing, so it fails silently in both directions. Pin that no
  // policy link is ever empty again.
  it('every policy link is a real route', () => {
    const app = readFileSync(join('src', 'App.jsx'), 'utf8');
    for (const [name, path] of Object.entries(portalConfig.policyLinks)) {
      expect(path, `policyLinks.${name} is empty`).toMatch(/^\/\S+$/);
      // Routed either as a literal path or through the config value itself.
      expect(
        app.includes(`path="${path}"`) || app.includes(`policyLinks.${name}`),
        `no route in App.jsx for policyLinks.${name}`,
      ).toBe(true);
    }
  });

  it('the code of conduct is routed, linked, and reachable from the waiver', () => {
    expect(portalConfig.policyLinks.codeOfConduct).toBe(`/${codeOfConduct.slug}`);
    expect(legalDocuments).toContain(codeOfConduct);
    const footer = readFileSync(join('src', 'components', 'Footer.jsx'), 'utf8');
    expect(footer).toContain('policyLinks.codeOfConduct');
    // The waiver binds people to "all Event rules"; those rules have to be
    // somewhere they can read before they accept it.
    expect(JSON.stringify(participantWaiver)).toContain(
      portalConfig.policyLinks.codeOfConduct,
    );
  });

  // Someone being harassed needs to find the reporting route without reading
  // the whole document, and it has to be the address that is actually staffed.
  it('the code of conduct says how to report and what follows', () => {
    const body = codeOfConduct.sections.flatMap((s) => s.paragraphs).join('\n');
    expect(body).toContain(portalConfig.contactEmail);
    expect(codeOfConduct.sections.map((s) => s.heading)).toContain(
      'Reporting something',
    );
  });

  it('the waiver is routed and linked like the other two', () => {
    expect(portalConfig.policyLinks.waiver).toBe(`/${participantWaiver.slug}`);
    const app = readFileSync(join('src', 'App.jsx'), 'utf8');
    expect(app).toContain(`path="${portalConfig.policyLinks.waiver}"`);
  });

  // The RSVP form must not render against placeholder text. statusView.js
  // reads this flag; this pins that the flag exists and is a boolean.
  it('the waiver declares whether it is still a placeholder', () => {
    expect(typeof participantWaiver.placeholder).toBe('boolean');
    expect(participantWaiver.version).toBe(portalConfig.waiverVersion);
  });

  // The flag and the text have to agree. A waiver marked live while draft
  // wording is still in it would open the RSVP form against text nobody
  // intended people to be bound by -- which is the exact failure the flag
  // exists to prevent.
  it('carries no draft wording once it is marked live', () => {
    if (participantWaiver.placeholder) return;
    const body = [
      ...participantWaiver.intro,
      ...participantWaiver.sections.flatMap((s) => [s.heading, ...s.paragraphs]),
    ].join('\n');
    expect(body).not.toMatch(/PLACEHOLDER|TBD|\[Organi[sz]ation/i);
    expect(participantWaiver.sections.length).toBeGreaterThanOrEqual(5);
    for (const section of participantWaiver.sections) {
      expect(section.paragraphs.length).toBeGreaterThan(0);
    }
  });

  // The event is 18+ and the server enforces it, so the waiver must not carry
  // a guardian-consent path that no applicant can ever reach.
  it('offers no under-18 guardian path', () => {
    const body = participantWaiver.sections
      .flatMap((s) => s.paragraphs)
      .join('\n');
    expect(body).not.toMatch(/guardian/i);
    expect(body).toContain(String(portalConfig.minimumAge));
  });
});
