import { palette } from './src/theme/tokens.js'

/**
 * Legacy Material-3 tokens, kept ONLY for the Supabase-backed admissions
 * portal (`/apply`, `/apply/admin` — src/pages/Admissions*.jsx and
 * src/admissions/**), which is out of scope for the Deep Field redesign and
 * still ships to real applicants.
 *
 * This is the subset that is still referenced, not the ~80-token dump that
 * used to live here. Do NOT reach for these in new code — the landing page
 * uses the Deep Field palette in src/theme/tokens.js plus the faction-driven
 * `accent`. tailwind.config.test.js pins both sets so this block cannot
 * quietly grow, and src/theme/tailwindClasses.test.js fails the build if any
 * of them is deleted while something still references it.
 */
const legacyAdmissionsColors = {
  background: '#11131c',
  'surface-container-lowest': '#0c0e17',
  'on-surface': '#e2e1ef',
  'on-surface-variant': '#c4c5d9',
  outline: '#8e90a2',
  primary: '#b8c3ff',
  'primary-container': '#2e5bff',
  'primary-fixed-dim': '#b8c3ff',
  'secondary-container': '#ffdb3c',
  'secondary-fixed': '#ffe16d',
  'cyber-blue': '#2e5bff',
}

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        ...palette,
        // Driven by [data-faction] on <html>. See src/faction/FactionContext.jsx.
        //
        // The channels-plus-<alpha-value> form is load-bearing, not a
        // stylistic choice: a bare `var(--accent)` cannot take Tailwind's
        // opacity modifier, so `bg-accent/5`, `border-accent/10`,
        // `ring-accent/70` and friends silently emit NOTHING. The whole
        // landing page leans on those. See src/index.css for --accent-rgb.
        accent: 'rgb(var(--accent-rgb) / <alpha-value>)',
        'accent-ink': 'rgb(var(--accent-ink-rgb) / <alpha-value>)',
        ...legacyAdmissionsColors,
      },
      fontFamily: {
        display: ['Chakra Petch', 'system-ui', 'sans-serif'],
        sans: ['IBM Plex Sans', 'system-ui', 'sans-serif'],
        mono: ['IBM Plex Mono', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      spacing: {
        gutter: '24px',
        'container-max': '1280px',
      },
      maxWidth: {
        'container-max': '1280px',
      },
      boxShadow: {
        // Legacy — admissions portal only. See legacyAdmissionsColors above.
        'glow-blue': '0 0 25px rgba(46, 91, 255, 0.45)',
      },
    },
  },
  plugins: [],
}

export { legacyAdmissionsColors }
