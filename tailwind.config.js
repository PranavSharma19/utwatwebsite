import { palette } from './src/theme/tokens.js'

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        ...palette,
        // Driven by [data-faction] on <html>. See src/faction/FactionContext.jsx.
        accent: 'var(--accent)',
        'accent-ink': 'var(--accent-ink)',
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
    },
  },
  plugins: [],
}
