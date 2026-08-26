import { describe, it, expect } from 'vitest'
import { sponsors } from './sponsors'

describe('sponsor data', () => {
  it('has at least the five confirmed sponsors', () => {
    expect(sponsors.length).toBeGreaterThanOrEqual(5)
  })

  it('gives every sponsor a name, a logo and a url', () => {
    for (const s of sponsors) {
      expect(s.name, 'sponsor is missing a name').toBeTruthy()
      expect(s.logo, `${s.name} is missing a logo`).toBeTruthy()
      expect(s.url, `${s.name} is missing a url`).toMatch(/^https:\/\//)
    }
  })

  // The cap was 1 when every logo here was a wordmark, which only ever needs
  // scaling down. A compact square mark next to a 3.3:1 wordmark has to run
  // taller to carry the same optical weight, so the ceiling is 1.5 — still
  // tight enough to catch a typo'd 12 or 0.05.
  it('uses a sane optical scale where one is given', () => {
    for (const s of sponsors) {
      if (s.logoScale === undefined) continue
      expect(s.logoScale, `${s.name} logoScale out of range`).toBeGreaterThan(0.3)
      expect(s.logoScale, `${s.name} logoScale out of range`).toBeLessThanOrEqual(1.5)
    }
  })

  it('keeps every logo inside its card', () => {
    // Cards are h-32 (128px) with p-6 (24px each side), so 80px of usable
    // height on the smaller breakpoint. maxHeight is 3.25rem * logoScale.
    for (const s of sponsors) {
      const px = 3.25 * 16 * (s.logoScale ?? 1)
      expect(px, `${s.name} would overflow its card`).toBeLessThanOrEqual(80)
    }
  })

  it('has no duplicate sponsors', () => {
    const names = sponsors.map((s) => s.name.toLowerCase())
    expect(new Set(names).size).toBe(names.length)
  })
})
