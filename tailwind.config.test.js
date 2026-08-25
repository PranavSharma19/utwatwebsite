import { describe, it, expect } from 'vitest'
import config, { legacyAdmissionsColors } from './tailwind.config.js'
import { palette } from './src/theme/tokens.js'

const { fontFamily, colors, boxShadow } = config.theme.extend

describe('typography config', () => {
  it('uses a real monospace for the mono slot', () => {
    // Regression guard: this was ["Inter", "monospace"] — a sans in the mono slot.
    expect(fontFamily.mono[0]).toBe('IBM Plex Mono')
    expect(fontFamily.mono[0]).not.toBe('Inter')
  })

  it('keeps display, sans and mono distinct', () => {
    const heads = [fontFamily.display[0], fontFamily.sans[0], fontFamily.mono[0]]
    expect(new Set(heads).size).toBe(3)
  })

  it('uses Chakra Petch for display and IBM Plex Sans for body', () => {
    expect(fontFamily.display[0]).toBe('Chakra Petch')
    expect(fontFamily.sans[0]).toBe('IBM Plex Sans')
  })
})

describe('colour config', () => {
  // Literal hex, deliberately duplicated from src/theme/tokens.js rather than
  // imported from it. `colors` is built with `{ ...palette }`, so
  // `expect(colors[key]).toBe(palette[key])` compares the palette to itself
  // and cannot fail no matter what the values become — and this is the only
  // guard pinning them, since every contrast measurement in the codebase is
  // taken against these six numbers.
  const DEEP_FIELD = {
    void: '#0A0C14',
    uoft: '#1E3765',
    panel: '#24406F',
    signal: '#8BA7DA',
    waterloo: '#FDD54F',
    ink: '#E2E1EF',
    muted: '#C3CBDD',
  }

  it.each(Object.entries(DEEP_FIELD))('pins %s to %s', (key, hex) => {
    expect(colors[key]).toBe(hex)
    expect(palette[key]).toBe(hex)
  })

  it('is the whole Deep Field palette and nothing more', () => {
    expect(Object.keys(palette).sort()).toEqual(Object.keys(DEEP_FIELD).sort())
  })

  it('wires the accent to CSS custom properties so theming needs no JS', () => {
    // The `<alpha-value>` placeholder over raw channels is load-bearing: a
    // bare `var(--accent)` compiles `bg-accent/5`, `border-accent/10`,
    // `ring-accent/70` and every other opacity-modified accent utility to
    // nothing at all, silently. src/theme/tailwindClasses.test.js is what
    // would catch a regression here in practice; this pins the shape.
    expect(colors.accent).toBe('rgb(var(--accent-rgb) / <alpha-value>)')
    expect(colors['accent-ink']).toBe('rgb(var(--accent-ink-rgb) / <alpha-value>)')
    expect(colors.accent).toContain('<alpha-value>')
  })

  it('has dropped the unused Material dump', () => {
    // Not a count of the whole config — the admissions portal legitimately
    // needs a handful of Material tokens back (see below), so counting keys
    // measures nothing. What matters is that the faction/Deep Field surface
    // stays small and that the dump's long tail is really gone.
    const factionTokens = Object.keys(colors).filter(
      (key) => !(key in legacyAdmissionsColors),
    )
    expect(factionTokens.sort()).toEqual([
      'accent',
      'accent-ink',
      'ink',
      'muted',
      'panel',
      'signal',
      'uoft',
      'void',
      'waterloo',
    ])
    for (const gone of [
      'on-tertiary-fixed-variant',
      'surface-container-highest',
      'inverse-on-surface',
      'secondary-fixed-dim',
      'cyber-gold',
      'error-container',
    ]) {
      expect(colors[gone], `${gone} should not have come back`).toBeUndefined()
    }
  })
})

describe('legacy admissions tokens', () => {
  // These exist only because /apply and /apply/admin still reference them and
  // ship to real applicants. Deleting one silently unstyles a live portal —
  // which is exactly what happened once already — so each is pinned by value
  // and src/theme/tailwindClasses.test.js pins that each is still needed.
  it('pins the restored Material subset', () => {
    expect(legacyAdmissionsColors).toEqual({
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
    })
  })

  it('keeps the one legacy shadow the portal still uses', () => {
    expect(boxShadow['glow-blue']).toBe('0 0 25px rgba(46, 91, 255, 0.45)')
  })
})
