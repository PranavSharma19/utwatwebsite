import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { privacyPolicy, termsOfService, legalDocuments } from './legalContent';
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

  it('explains that the poll stores a hash and never the address itself', () => {
    expect(text).toContain('hash');
    expect(text).toMatch(/never (written|stored)/);
  });

  it('covers the browser storage the site sets', () => {
    // factionStorage writes localStorage; Crawl writes sessionStorage.
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
});
