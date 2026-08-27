import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import PortalShell from './PortalShell';
import { portalConfig } from './portalConfig';

const renderShell = (props = {}) =>
  render(
    <MemoryRouter>
      <PortalShell {...props}>
        <p>body</p>
      </PortalShell>
    </MemoryRouter>,
  );

/**
 * The console's path is not a security boundary -- admin-applications checks
 * the caller against ADMIN_EMAIL_ALLOWLIST, and the string ships in the JS
 * bundle regardless. But linking it from the page every applicant sees put it
 * one click from anyone, which is worth not doing. These pin that.
 */
describe('PortalShell — the admin console is not advertised', () => {
  it('shows no admin link on the applicant shell', () => {
    renderShell();
    expect(
      screen.queryByRole('link', { name: /admin/i }),
    ).not.toBeInTheDocument();
  });

  it('puts the console path in no href an applicant can see', () => {
    const { container } = renderShell();
    const hrefs = [...container.querySelectorAll('a[href]')].map((a) =>
      a.getAttribute('href'),
    );
    expect(hrefs).not.toContain(portalConfig.adminPath);
  });

  // The reverse direction stays: once you are in the console you need a way
  // back out to the applicant view.
  it('still offers the way back when rendered as the admin shell', () => {
    renderShell({ admin: true });
    expect(
      screen.getByRole('link', { name: /applicant view/i }),
    ).toHaveAttribute('href', '/apply');
  });
});
