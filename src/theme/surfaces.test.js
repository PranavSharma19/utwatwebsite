import { describe, it, expect } from 'vitest'
import { contrastRatio } from './contrast'
import { palette } from './tokens'

/**
 * Surface visibility.
 *
 * Every contrast test in this project measured TEXT ON a surface. Text passed
 * easily — precisely because the surfaces were so close to the page ground
 * that they were effectively the ground. Nobody checked whether the surface
 * itself was visible, and the site shipped with cards, panels and form fields
 * measuring 1.07:1 against the void. They rendered as invisible boxes and the
 * starfield showed straight through them.
 *
 * These pin the surfaces themselves. WCAG has nothing to say here — a
 * background is not text and is not a control boundary — so the threshold is
 * empirical: below about 1.3:1 a panel stops reading as a distinct surface on
 * a dark ground.
 */
const MIN_SURFACE = 1.3

/** alpha-blend a token over the page ground, the way the browser will. */
function over(hex, alpha, bg = palette.void) {
  const h = (c) => [1, 3, 5].map((i) => parseInt(c.substr(i, 2), 16))
  const [r, g, b] = h(hex)
  const [br, bg2, bb] = h(bg)
  const mix = (f, k) => Math.round(alpha * f + (1 - alpha) * k)
  return (
    '#' +
    [mix(r, br), mix(g, bg2), mix(b, bb)]
      .map((v) => v.toString(16).padStart(2, '0'))
      .join('')
  )
}

describe('surfaces are actually visible against the page', () => {
  const surfaces = [
    ['faction panel — UTMIST', palette.panel, 1],
    ['faction panel — WAT.ai', palette.waterloo, 0.25],
    ['cards / form fields', palette.panel, 0.8],
  ]

  it.each(surfaces)('%s reads as a surface', (_label, token, alpha) => {
    const rendered = over(token, alpha)
    expect(contrastRatio(rendered, palette.void)).toBeGreaterThanOrEqual(MIN_SURFACE)
  })

  it('the two faction panels feel equally solid', () => {
    const utmist = contrastRatio(over(palette.panel, 1), palette.void)
    const watai = contrastRatio(over(palette.waterloo, 0.25), palette.void)
    // One side visibly heavier than the other reads as "that one is selected".
    expect(Math.abs(utmist - watai)).toBeLessThan(0.4)
  })

  it('uoft alone cannot carry a panel, which is why `panel` exists', () => {
    // Documents the reason for the extra token: even at full opacity uoft
    // only reaches 1.66:1, and at the /20 originally used, 1.07:1.
    expect(contrastRatio(palette.uoft, palette.void)).toBeLessThan(1.7)
    expect(contrastRatio(over(palette.uoft, 0.2), palette.void)).toBeLessThan(MIN_SURFACE)
    expect(contrastRatio(palette.panel, palette.void)).toBeGreaterThanOrEqual(1.8)
  })
})
